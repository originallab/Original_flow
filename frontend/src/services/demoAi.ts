import { AI_BLOCK_TYPES } from '@/shared/aiBlocks';
import type { Block } from '@/shared/blocks/types';
import { done, fail, ownFunnel, skip, type Answer, type FunnelsContext } from './demoCore';
import { syncCtas } from './demoFunnelActions';

/**
 * La IA de mentira del modo demostración (sin servidor): no escribe nada nuevo, solo marca los textos con «(IA)» para
 * que se note que la propuesta cambió. Con las mismas rutas y errores que el backend real; no sirve para juzgar la
 * calidad de la IA (eso solo se ve con el servidor).
 */

const MARK = ' (IA)';
const MAX_TEXT = 190;

function rewrite(value: unknown): unknown {
  if (typeof value === 'string') return value.trim() === '' || /^https?:\/\//.test(value) ? value : `${value.slice(0, MAX_TEXT)}${MARK}`;
  if (Array.isArray(value)) return value.map(rewrite);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, ['name', 'type', 'url', 'fileId', 'fileIds'].includes(key) ? inner : rewrite(inner)]));
  return value;
}

export const rewriteContent = (content: Record<string, unknown>): Record<string, unknown> => rewrite(content) as Record<string, unknown>;

export function demoAiRoute(ctx: FunnelsContext): Answer {
  const { route, method, data, save } = ctx;

  const block = /^\/funnels\/([^/]+)\/content\/blocks\/([^/]+)\/regenerate$/.exec(route);
  if (block && method === 'POST') {
    const funnel = ownFunnel(ctx, decodeURIComponent(block[1] ?? ''));
    const found = funnel.content.blocks.find((b) => b.key === decodeURIComponent(block[2] ?? ''));
    if (!found) throw fail(404, 'BLOCK_NOT_FOUND', 'Bloque no encontrado');
    if (!AI_BLOCK_TYPES.includes(found.type)) throw fail(422, 'AI_BLOCK_NOT_SUPPORTED', 'La IA no puede reescribir este tipo de bloque');
    return done({ key: found.key, type: found.type, content: rewriteContent(found.content) });
  }

  const page = /^\/funnels\/([^/]+)\/generate$/.exec(route);
  if (page && method === 'POST') {
    const funnel = ownFunnel(ctx, decodeURIComponent(page[1] ?? ''));
    if (funnel.status === 'published') throw fail(409, 'FUNNEL_PUBLISHED', 'Despublica el funnel antes de volver a generar su página');
    if (funnel.content.blocks.length === 0) throw fail(503, 'AI_UNAVAILABLE', 'La IA no respondió');
    const instruction = typeof data.instruction === 'string' ? data.instruction.trim() : '';
    funnel.content = {
      blocks: funnel.content.blocks.map((b): Block => (AI_BLOCK_TYPES.includes(b.type) ? { ...b, content: rewriteContent(b.content) } : b)),
    };
    funnel.seo = { title: `${funnel.name}${instruction ? ` · ${instruction.slice(0, 40)}` : ''}`.slice(0, 120) };
    funnel.updatedAt = new Date().toISOString();
    syncCtas(ctx, funnel);
    save();
    return done(funnel);
  }
  return skip;
}
