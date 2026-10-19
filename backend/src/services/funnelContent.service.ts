import type { Prisma } from '../generated/prisma/client.js';
import {
  CTA_ACTIONS_BY_BLOCK,
  CTA_BLOCK_TYPES,
  readBlocks,
  validateBlockContent,
  type StoredBlock,
} from '../funnel-types/blocks.js';
import { getFunnelType } from '../funnel-types/index.js';
import { AppError } from '../lib/errors.js';
import type { CtaModel } from '../models/cta.model.js';
import type { DesiredCta, FunnelModel, FunnelRecord } from '../models/funnel.model.js';
import type { Block, DesignSpecBody, PatchBlockBody, PatchCtaBody } from '../schemas/funnel.schemas.js';
import type { AuditService } from './audit.service.js';
import type { RequestContext } from './auth.service.js';
import type { FunnelService } from './funnel.service.js';

interface Deps {
  funnels: FunnelModel;
  ctas: CtaModel;
  funnelService: FunnelService;
  audit: AuditService;
}

/** El texto del CTA sale del bloque: la etiqueta del botón o el texto de envío del formulario. */
function ctaLabel(block: StoredBlock): string {
  const key = block.type === 'formulario' ? 'submitLabel' : 'label';
  const value = block.content[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Los CTA que deben existir para estos bloques: uno por cada `boton` o `formulario`.
 * Un botón nace con la acción principal del tipo de funnel (`checkout` si cobra,
 * `scroll_to` si no); un formulario, siempre con `form_submit`.
 */
function desiredCtas(funnel: FunnelRecord, blocks: StoredBlock[]): DesiredCta[] {
  const charges = getFunnelType(funnel.objective).charges;
  return blocks
    .filter((b) => CTA_BLOCK_TYPES.includes(b.type))
    .map((b) => ({
      blockKey: b.key,
      label: ctaLabel(b),
      actionType: b.type === 'formulario' ? 'form_submit' : charges ? 'checkout' : 'scroll_to',
      allowed: CTA_ACTIONS_BY_BLOCK[b.type] ?? [],
    }));
}

export function createFunnelContentService({ funnels, ctas, funnelService, audit }: Deps) {
  async function persist(funnel: FunnelRecord, blocks: StoredBlock[]) {
    const saved = await funnels.saveContent(funnel.id, { blocks } as unknown as Prisma.InputJsonValue, desiredCtas(funnel, blocks));
    return { blocks: readBlocks(saved.content), updatedAt: saved.updatedAt };
  }

  return {
    /** PUT /funnels/:id/content: reemplaza el contenido (autoguardado) y sincroniza los CTA. */
    async putContent(userId: string, funnelId: string, blocks: Block[]) {
      const { funnel } = await funnelService.load(userId, funnelId, 'funnel:edit');
      return persist(funnel, blocks);
    },

    /** PATCH /funnels/:id/content/blocks/:key: cambia un solo bloque. El tipo no se cambia. */
    async patchBlock(userId: string, funnelId: string, key: string, body: PatchBlockBody) {
      const { funnel } = await funnelService.load(userId, funnelId, 'funnel:edit');
      const blocks = readBlocks(funnel.content);
      const index = blocks.findIndex((b) => b.key === key);
      const current = blocks[index];
      if (!current) throw AppError.notFound('BLOCK_NOT_FOUND', 'Bloque no encontrado');

      const merged: StoredBlock = {
        ...current,
        ...(body.content === undefined ? {} : { content: body.content }),
        ...(body.style === undefined ? {} : { style: body.style }),
        ...(body.order === undefined ? {} : { order: body.order }),
      };
      const issues = validateBlockContent(merged.type, merged.content);
      if (issues.length > 0) {
        throw AppError.unprocessable(
          'VALIDATION_ERROR',
          'Los datos enviados no son válidos',
          issues.map((i) => ({ path: ['content', ...i.path].join('.'), message: i.message })),
        );
      }
      blocks[index] = merged;
      return persist(funnel, blocks);
    },

    /** PUT /funnels/:id/design-spec: guarda la plantilla, la paleta y las tipografías de la página. */
    async putDesignSpec(userId: string, funnelId: string, body: DesignSpecBody, ctx: RequestContext) {
      const { funnel } = await funnelService.load(userId, funnelId, 'funnel:edit');
      const saved = await funnels.setDesignSpec(funnel.id, body as Prisma.InputJsonValue);
      await audit.record({
        action: 'funnel.design_update',
        resourceType: 'funnel',
        resourceId: funnel.id,
        workspaceId: funnel.workspaceId,
        userId,
        ip: ctx.ip,
        metadata: { template: body.template },
      });
      return { designSpec: saved.designSpec };
    },

    /** PUT /funnels/:id/type-config: guarda y valida los ajustes con el esquema del tipo de funnel. */
    async putTypeConfig(userId: string, funnelId: string, body: Record<string, unknown>, ctx: RequestContext) {
      const { funnel } = await funnelService.load(userId, funnelId, 'funnel:edit');
      const def = getFunnelType(funnel.objective);
      if (!def.available) {
        throw AppError.unprocessable('FUNNEL_TYPE_UNAVAILABLE', 'Ese tipo de funnel todavía no está disponible');
      }
      const typeConfig = def.typeConfigSchema.parse(body);
      const saved = await funnels.setTypeConfig(funnel.id, typeConfig as Prisma.InputJsonValue);
      await audit.record({
        action: 'funnel.type_config_update',
        resourceType: 'funnel',
        resourceId: funnel.id,
        workspaceId: funnel.workspaceId,
        userId,
        ip: ctx.ip,
      });
      return { typeConfig: saved.typeConfig };
    },

    /** GET /funnels/:id/ctas */
    async listCtas(userId: string, funnelId: string) {
      const { funnel } = await funnelService.load(userId, funnelId, 'funnel:edit');
      return ctas.listByFunnel(funnel.id);
    },

    /** PATCH /funnels/:id/ctas/:blockKey: destino, tipo de acción o seguimiento. */
    async patchCta(userId: string, funnelId: string, blockKey: string, body: PatchCtaBody, ctx: RequestContext) {
      const { funnel } = await funnelService.load(userId, funnelId, 'funnel:edit');
      const cta = await ctas.findByBlockKey(funnel.id, blockKey);
      if (!cta) throw AppError.notFound('CTA_NOT_FOUND', 'CTA no encontrado');

      const blockType = readBlocks(funnel.content).find((b) => b.key === blockKey)?.type;
      const allowed = (blockType && CTA_ACTIONS_BY_BLOCK[blockType]) || null;
      const actionType = body.actionType ?? cta.actionType;

      if (allowed && !allowed.includes(actionType)) {
        throw AppError.unprocessable('CTA_ACTION_NOT_ALLOWED', `Un ${blockType} no puede tener la acción ${actionType}`);
      }
      if (actionType === 'checkout' && !getFunnelType(funnel.objective).charges) {
        throw AppError.unprocessable('CTA_CHECKOUT_NOT_ALLOWED', 'Este tipo de funnel no cobra, no puede tener un botón de pago');
      }

      // Si cambia la acción y no se manda destino, el destino anterior ya no aplica.
      const destination =
        body.destination !== undefined ? body.destination : body.actionType && body.actionType !== cta.actionType ? null : cta.destination;
      if (actionType === 'url' && destination && !/^https?:\/\/\S+$/i.test(destination)) {
        throw AppError.unprocessable('CTA_DESTINATION_INVALID', 'El destino de un enlace debe ser una URL http o https');
      }

      const updated = await ctas.update(cta.id, {
        actionType,
        destination,
        ...(body.trackingId === undefined ? {} : { trackingId: body.trackingId }),
      });
      await audit.record({
        action: 'cta.update',
        resourceType: 'cta',
        resourceId: cta.id,
        workspaceId: funnel.workspaceId,
        userId,
        ip: ctx.ip,
        metadata: { fields: Object.keys(body) },
      });
      return updated;
    },
  };
}

export type FunnelContentService = ReturnType<typeof createFunnelContentService>;
