import { readBlocks, type StoredBlock } from '../funnel-types/blocks.js';
import { getFunnelType } from '../funnel-types/index.js';
import { AppError } from '../lib/errors.js';
import type { CtaModel } from '../models/cta.model.js';
import type { FunnelModel, FunnelRecord } from '../models/funnel.model.js';
import type { WorkspaceModel } from '../models/workspace.model.js';
import type { AuditService } from './audit.service.js';
import type { RequestContext } from './auth.service.js';
import type { FunnelDto, FunnelService } from './funnel.service.js';
import { withNumberPrice } from './funnel.service.js';

/** Un requisito que todavía falta para poder publicar (alimenta el checklist del modal de publicar). */
export interface PublishProblem {
  code: string;
  message: string;
  /** Campo o bloque al que se refiere, si aplica. */
  field?: string;
}

interface Deps {
  funnels: FunnelModel;
  ctas: CtaModel;
  workspaces: WorkspaceModel;
  funnelService: FunnelService;
  audit: AuditService;
}

interface CtaLike {
  blockKey: string;
  actionType: string;
  destination: string | null;
}

/** Revisa todo lo que debe cumplir un funnel antes de publicarse y devuelve lo que falta. */
export function findPublishProblems(
  funnel: FunnelRecord,
  blocks: StoredBlock[],
  ctas: CtaLike[],
  hasPayments: boolean,
): PublishProblem[] {
  const problems: PublishProblem[] = [];
  const def = getFunnelType(funnel.objective);

  if (blocks.length === 0) {
    problems.push({ code: 'CONTENT_EMPTY', message: 'La página no tiene ningún bloque', field: 'content' });
  }

  const config = def.typeConfigSchema.safeParse(funnel.typeConfig ?? {});
  if (!config.success) {
    const fields = [...new Set(config.error.issues.map((i) => i.path.join('.') || 'typeConfig'))];
    problems.push({
      code: 'TYPE_CONFIG_INCOMPLETE',
      message: `Faltan ajustes del tipo de funnel: ${fields.join(', ')}`,
      field: 'typeConfig',
    });
  }

  if (def.primaryCta === 'form_submit' && !blocks.some((b) => b.type === 'formulario')) {
    problems.push({ code: 'FORM_MISSING', message: 'Este tipo de funnel necesita un formulario', field: 'content' });
  }
  if (def.primaryCta === 'checkout' && !ctas.some((c) => c.actionType === 'checkout')) {
    problems.push({ code: 'CHECKOUT_BUTTON_MISSING', message: 'Falta un botón de pago', field: 'content' });
  }

  if (def.charges) {
    if (funnel.price == null || funnel.price.toNumber() <= 0) {
      problems.push({ code: 'PRICE_MISSING', message: 'Falta el precio del producto', field: 'price' });
    }
    if (!hasPayments) {
      problems.push({ code: 'PAYMENTS_NOT_CONNECTED', message: 'El workspace no tiene Original Pay conectado' });
    }
  }

  for (const cta of ctas) {
    if (cta.actionType === 'url' && !cta.destination) {
      problems.push({ code: 'CTA_DESTINATION_MISSING', message: `El botón "${cta.blockKey}" no tiene destino`, field: cta.blockKey });
    }
  }
  return problems;
}

export function createFunnelPublishService({ funnels, ctas, workspaces, funnelService, audit }: Deps) {
  return {
    /**
     * POST /funnels/:id/publish: valida y publica; guarda una versión en el historial.
     * Si ya estaba publicado no hace nada (es idempotente) y no crea otra versión.
     */
    async publish(userId: string, funnelId: string, ctx: RequestContext): Promise<FunnelDto> {
      const { funnel } = await funnelService.load(userId, funnelId, 'funnel:publish');
      if (funnel.status === 'published') return withNumberPrice(funnel);

      const [funnelCtas, hasPayments] = await Promise.all([
        ctas.listByFunnel(funnel.id),
        workspaces.hasPaymentsConnected(funnel.workspaceId),
      ]);
      const problems = findPublishProblems(funnel, readBlocks(funnel.content), funnelCtas, hasPayments);
      if (problems.length > 0) {
        throw AppError.unprocessable('FUNNEL_NOT_READY', 'El funnel todavía no se puede publicar', { missing: problems });
      }

      const published = await funnels.publish(funnel.id, userId);
      await audit.record({
        action: 'funnel.publish',
        resourceType: 'funnel',
        resourceId: funnel.id,
        workspaceId: funnel.workspaceId,
        userId,
        ip: ctx.ip,
      });
      return withNumberPrice(published);
    },

    /** POST /funnels/:id/unpublish: vuelve a borrador sin borrar nada. Idempotente. */
    async unpublish(userId: string, funnelId: string, ctx: RequestContext): Promise<FunnelDto> {
      const { funnel } = await funnelService.load(userId, funnelId, 'funnel:publish');
      if (funnel.status === 'draft') return withNumberPrice(funnel);

      const draft = await funnels.unpublish(funnel.id);
      await audit.record({
        action: 'funnel.unpublish',
        resourceType: 'funnel',
        resourceId: funnel.id,
        workspaceId: funnel.workspaceId,
        userId,
        ip: ctx.ip,
      });
      return withNumberPrice(draft);
    },
  };
}

export type FunnelPublishService = ReturnType<typeof createFunnelPublishService>;
