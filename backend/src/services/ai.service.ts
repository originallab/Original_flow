import { validateBlockContent, BLOCK_TYPES, type BlockType } from '../funnel-types/blocks.js';
import { cleanIcons, cleanProposalDesign, fillIcons } from '../funnel-types/design.js';
import { hash } from '../funnel-types/directions.js';
import { noveltyHero, noveltyLook, noveltyPalette, noveltyStructure, noveltyVariants, pastPageOf } from '../funnel-types/novelty.js';
import { creativeBrief, describeDesign, qualityExamples } from '../funnel-types/creative.js';
import { diversifyHeading, enrichLook, fallbackDesign, guardLook, pickPalette, polishBlocks, randomHints } from '../funnel-types/polish.js';
import { randomUUID } from 'node:crypto';
import { getFunnelType } from '../funnel-types/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AiBrandBrief, AiContext, AiEngine } from '../integrations/ai-engine/types.js';
import { AI_BLOCK_TYPES } from '../integrations/ai-engine/prompts.js';
import { AppError } from '../lib/errors.js';
import type { WindowLimiter } from '../lib/windowLimiter.js';
import type { FunnelModel, FunnelRecord } from '../models/funnel.model.js';
import type { AssetModel } from '../models/asset.model.js';
import type { WorkspaceModel } from '../models/workspace.model.js';
import { brandPaletteSchema } from '../schemas/workspace.schemas.js';
import { generatedPageSchema } from '../schemas/ai.schemas.js';
import { contentBodySchema, type DesignSpecBody } from '../schemas/funnel.schemas.js';
import type { GenerateBody, RegenerateBody } from '../schemas/ai.schemas.js';
import type { AuditService } from './audit.service.js';
import type { RequestContext } from './auth.service.js';
import { desiredCtas } from './funnelContent.service.js';
import type { FunnelDto, FunnelService } from './funnel.service.js';

interface Deps {
  funnels: FunnelModel;
  funnelService: FunnelService;
  workspaces: WorkspaceModel;
  assets: AssetModel;
  engine: AiEngine;
  /** Cupo de usos de la IA por negocio y hora. */
  limiter: WindowLimiter;
  audit: AuditService;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
export function createAiService({ funnels, funnelService, workspaces, assets, engine, limiter, audit }: Deps) {
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
      const workspace = await workspaces.findById(funnel.workspaceId);
      // Las imágenes que la persona subió: deben ser de este negocio (las de otro no se aceptan, ni se revela que existen).
      const wanted = [...new Set(body.images ?? [])];
      const owned = wanted.length > 0 ? await assets.findOwned(funnel.workspaceId, wanted) : [];
      if (owned.length !== wanted.length) throw AppError.unprocessable('ASSET_NOT_FOUND', 'Alguna de las imágenes no existe en este negocio');
      const images = owned.map((a) => ({ url: a.publicUrl, name: a.name }));
      // El logo del negocio, si tiene: debe ser una imagen de este mismo negocio.
      const [logoAsset] = workspace?.logoFileId && UUID.test(workspace.logoFileId) ? await assets.findOwned(funnel.workspaceId, [workspace.logoFileId]) : [];
      const logoUrl = logoAsset?.publicUrl;
      // La paleta de la marca, si el negocio la tiene: la página la usa tal cual (se garantiza más abajo, aunque la IA la ignore).
      const brand = brandPaletteSchema.safeParse(workspace?.brandPalette);
      const brandPalette = brand.success ? brand.data : undefined;
      // La IA diseña la página. Si ya tiene un diseño (volver a generar), se conserva. Si no, se le da una semilla creativa
      // distinta en cada generación y un resumen de lo que ya usan las otras páginas del negocio, para que no se le parezca.
      const brief = briefOf(funnel.brandBrief);
      const seed = randomUUID();
      const existing = funnel.designSpec as { template?: string; fonts?: { heading: string; body: string }; look?: unknown; palette?: unknown; pattern?: unknown } | null;
      const keepDesign = existing?.fonts ? existing : undefined;
      const recent = keepDesign ? [] : await funnels.recentDesigns(funnel.workspaceId, funnel.id, 8);
      // Las páginas anteriores del negocio, de la más reciente a la más antigua: la nueva se diferencia de ellas.
      const past = recent.map((r) => pastPageOf(r.designSpec, r.content));
      const avoid = keepDesign ? undefined : recent.map((r) => describeDesign(r.designSpec, r.content)).filter((d): d is string => d !== null);
      const usedHeadings = recent.map((r) => (r.designSpec as { fonts?: { heading?: unknown } } | null)?.fonts?.heading).filter((h): h is string => typeof h === 'string');
      // Con la creatividad alta el modelo a veces se desvía del formato: si la propuesta no sirve, se pide una vez más antes de rendirse.
      let parsed: ReturnType<typeof generatedPageSchema.safeParse> | undefined;
      let content: ReturnType<typeof contentBodySchema.safeParse> | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const proposal = await ask(funnel, ctx.requestId, 'generate_page', (aiCtx) =>
        engine.generatePage(aiCtx, {
          objective: funnel.objective,
          language: funnel.language,
          name: funnel.name,
          productName: funnel.productName ?? undefined,
          targetAudience: funnel.targetAudience ?? undefined,
          price: funnel.price === null ? undefined : Number(funnel.price),
          currency: funnel.price === null ? undefined : funnel.currency,
          brandBrief: brief,
          details: body.brief,
          ...(keepDesign ? { keepDesign } : { creative: creativeBrief(seed), examples: qualityExamples(seed, 2), ...(avoid && avoid.length > 0 ? { avoid } : {}) }),
          images: images.length > 0 ? images : undefined,
          logoUrl,
          brandPalette,
          blockTypes: BLOCK_TYPES,
          baseBlocks: def.baseBlocks,
          instruction: body.instruction,
        }),
        );
        parsed = generatedPageSchema.safeParse(cleanProposalDesign(proposal));
        content = parsed.success ? contentBodySchema.safeParse({ blocks: parsed.data.blocks }) : null;
        if (parsed.success && content?.success && content.data.blocks.length > 0) break;
      }
      if (!parsed?.success || !content?.success || content.data.blocks.length === 0) throw badResponse();

      // El estilo de cada bloque: lo que propuso la IA (solo variantes y fondos del catálogo) completado y corregido con la dirección.
      // Estructura y estilo de los bloques: se evita repetir el principio, el encabezado y las formas de las últimas páginas del negocio.
      const reordered = noveltyStructure(content.data.blocks, past, seed);
      const varied = noveltyVariants(
        reordered.map((b) => (b.type === 'encabezado' ? { ...b, style: noveltyHero(b.style, past, seed) } : b)),
        past,
        seed,
      );
      const blocks = polishBlocks(varied, randomHints(seed)).map((b, i) => ({ ...b, content: fillIcons(b.type, cleanIcons(b.type, b.content as Record<string, unknown>), hash(`i:${seed}:${i}`)) }));
      // La IA solo puede usar las imágenes que la persona subió: una dirección inventada o ajena invalida la página.
      const allowedUrls = new Set([...images.map((i) => i.url), ...(logoUrl ? [logoUrl] : [])]);
      for (const b of blocks) {
        const url = b.type === 'imagen' ? (b.content as { url?: unknown }).url : undefined;
        if (b.type === 'imagen' && (typeof url !== 'string' || !allowedUrls.has(url))) throw badResponse();
      }
      // El diseño lo propuso la IA (ya depurado: solo tipografías y aspecto del catálogo); lo que falte se completa con un respaldo.
      // La paleta: la de la marca si la tiene, si no la de la IA (corregida si no se leía bien).
      const proposed = parsed.data.designSpec;
      const backup = fallbackDesign(seed);
      // La paleta: la de la marca tal cual; si no, la de la IA (corregida) y diferenciada de la de las páginas anteriores.
      const chosen = pickPalette(backup.palette, brandPalette, proposed?.palette);
      const palette = brandPalette || keepDesign ? chosen : noveltyPalette(chosen, past, seed);
      const look = guardLook(noveltyLook(enrichLook(proposed?.look ?? (proposed?.fonts ? undefined : backup.look), palette, seed), past, seed), palette);
      const designSpec: DesignSpecBody = keepDesign
        ? { ...(keepDesign as DesignSpecBody), template: (keepDesign.template ?? backup.template) as DesignSpecBody['template'], ...(brandPalette ? { palette: brandPalette } : {}) }
        : {
            template: proposed?.template ?? backup.template,
            fonts: { ...(proposed?.fonts ?? backup.fonts), heading: diversifyHeading((proposed?.fonts ?? backup.fonts).heading, usedHeadings, seed) },
            look,
            palette,
            ...(existing?.pattern ? { pattern: existing.pattern as DesignSpecBody['pattern'] } : {}),
          };
      await funnels.applyGenerated(
        funnel.id,
        {
          content: { blocks } as unknown as Prisma.InputJsonValue,
          ...(designSpec ? { designSpec: designSpec as Prisma.InputJsonValue } : {}),
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
