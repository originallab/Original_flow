import { validateBlockContent, BLOCK_TYPES, type BlockType } from '../funnel-types/blocks.js';
import { getFunnelType } from '../funnel-types/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AiBrandBrief, AiContext, AiEngine } from '../integrations/ai-engine/types.js';
import { AI_BLOCK_TYPES } from '../integrations/ai-engine/prompts.js';
import { AppError } from '../lib/errors.js';
import type { WindowLimiter } from '../lib/windowLimiter.js';
import type { FunnelModel, FunnelRecord } from '../models/funnel.model.js';
import { generatedPageSchema } from '../schemas/ai.schemas.js';
import { contentBodySchema } from '../schemas/funnel.schemas.js';
import type { GenerateBody, RegenerateBody } from '../schemas/ai.schemas.js';
import type { AuditService } from './audit.service.js';
import type { RequestContext } from './auth.service.js';
import { desiredCtas } from './funnelContent.service.js';
import type { FunnelDto, FunnelService } from './funnel.service.js';

interface Deps {
  funnels: FunnelModel;
  funnelService: FunnelService;
  engine: AiEngine;
  /** Cupo de usos de la IA por negocio y hora. */
  limiter: WindowLimiter;
  audit: AuditService;
}

/** Una propuesta de bloque: se devuelve para que la persona la acepte o la descarte; no se guarda. */
export interface BlockProposal {
  key: string;
  type: BlockType;
  content: Record<string, unknown>;
}

/** El brief de marca se lee de forma defensiva: solo texto, solo los campos conocidos. */
function briefOf(raw: unknown): AiBrandBrief | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const brief: AiBrandBrief = {};
  for (const key of ['name', 'industry', 'tone', 'description'] as const) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) brief[key] = value.trim().slice(0, 500);
  }
  return Object.keys(brief).length > 0 ? brief : undefined;
}

/**
 * Generación con IA. El motor de IA es una pieza intercambiable (`AiEngine`): este servicio decide quién puede
 * pedirlo, cuánto, y **nunca confía en lo que devuelve**: toda propuesta se valida con las reglas del editor
 * antes de guardarse o de mostrarse. Generar la página deja el resultado en borrador; regenerar un bloque solo
 * devuelve una propuesta. Los textos de la persona y de la IA no se escriben en los logs ni en la auditoría.
 */
export function createAiService({ funnels, funnelService, engine, limiter, audit }: Deps) {
  /** Pide permiso de edición, cuenta el uso del negocio y llama al motor; cualquier fallo del motor es un 503. */
  async function ask<T>(funnel: FunnelRecord, requestId: string, action: AiContext['action'], call: (ctx: AiContext) => Promise<T>): Promise<T> {
    if (!limiter.take(funnel.workspaceId)) {
      throw AppError.tooManyRequests('AI_RATE_LIMITED', 'Se alcanzó el límite de usos de la IA de este negocio; intenta más tarde');
    }
    try {
      return await call({ requestId, workspaceId: funnel.workspaceId, action });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.serviceUnavailable('AI_UNAVAILABLE', 'La IA no respondió; intenta de nuevo');
    }
  }

  const badResponse = () => AppError.serviceUnavailable('AI_BAD_RESPONSE', 'La IA devolvió una respuesta que no se puede usar; intenta de nuevo');

  return {
    /** POST /funnels/:id/generate: la IA arma la página y queda en borrador. Si algo falla, el funnel no cambia. */
    async generate(userId: string, funnelId: string, body: GenerateBody, ctx: RequestContext): Promise<FunnelDto> {
      const { funnel } = await funnelService.load(userId, funnelId, 'funnel:edit');
      if (funnel.status === 'published') {
        throw AppError.conflict('FUNNEL_PUBLISHED', 'Despublica el funnel antes de volver a generar su página');
      }
      const def = getFunnelType(funnel.objective);
      const proposal = await ask(funnel, ctx.requestId, 'generate_page', (aiCtx) =>
        engine.generatePage(aiCtx, {
          objective: funnel.objective,
          language: funnel.language,
          name: funnel.name,
          productName: funnel.productName ?? undefined,
          targetAudience: funnel.targetAudience ?? undefined,
          price: funnel.price === null ? undefined : Number(funnel.price),
          currency: funnel.price === null ? undefined : funnel.currency,
          brandBrief: briefOf(funnel.brandBrief),
          details: body.brief,
          blockTypes: BLOCK_TYPES,
          baseBlocks: def.baseBlocks,
          instruction: body.instruction,
        }),
      );

      const parsed = generatedPageSchema.safeParse(proposal);
      const content = parsed.success ? contentBodySchema.safeParse({ blocks: parsed.data.blocks }) : null;
      if (!parsed.success || !content?.success || content.data.blocks.length === 0) throw badResponse();

      const blocks = content.data.blocks;
      await funnels.applyGenerated(
        funnel.id,
        {
          content: { blocks } as unknown as Prisma.InputJsonValue,
          ...(parsed.data.designSpec ? { designSpec: parsed.data.designSpec as Prisma.InputJsonValue } : {}),
          ...(parsed.data.seo ? { seo: parsed.data.seo as Prisma.InputJsonValue } : {}),
        },
        desiredCtas(funnel, blocks),
      );
      await audit.record({
        action: 'funnel.ai_generate',
        resourceType: 'funnel',
        resourceId: funnel.id,
        workspaceId: funnel.workspaceId,
        userId,
        ip: ctx.ip,
        metadata: { blocks: blocks.length },
      });
      return funnelService.get(userId, funnel.id);
    },

    /** POST /funnels/:id/content/blocks/:key/regenerate: devuelve una propuesta para ese bloque, sin guardarla. */
    async regenerateBlock(userId: string, funnelId: string, key: string, body: RegenerateBody, ctx: RequestContext): Promise<BlockProposal> {
      const { funnel } = await funnelService.load(userId, funnelId, 'funnel:edit');
      const block = (funnel.content as { blocks?: { key: string; type: BlockType; content: Record<string, unknown> }[] } | null)?.blocks?.find((b) => b.key === key);
      if (!block) throw AppError.notFound('BLOCK_NOT_FOUND', 'Bloque no encontrado');
      // Los bloques que necesitan datos que la IA no debe inventar (testimonios, logos, imágenes...) no se reescriben.
      if (!AI_BLOCK_TYPES.includes(block.type)) {
        throw AppError.unprocessable('AI_BLOCK_NOT_SUPPORTED', 'La IA no puede reescribir este tipo de bloque');
      }

      const proposal = await ask(funnel, ctx.requestId, 'regenerate_block', (aiCtx) =>
        engine.regenerateBlock(aiCtx, {
          objective: funnel.objective,
          language: funnel.language,
          brandBrief: briefOf(funnel.brandBrief),
          block: { key: block.key, type: block.type, content: block.content },
          instruction: body.instruction,
        }),
      );

      const content = (proposal as { content?: unknown } | null)?.content;
      if (content === null || typeof content !== 'object' || Array.isArray(content) || validateBlockContent(block.type, content).length > 0) {
        throw badResponse();
      }
      return { key: block.key, type: block.type, content: content as Record<string, unknown> };
    },
  };
}

export type AiService = ReturnType<typeof createAiService>;
