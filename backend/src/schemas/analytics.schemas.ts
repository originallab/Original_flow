import { z } from 'zod';
import { DAY_MS, RANGE_DAYS, type Period } from '../lib/analytics.js';

/** Lo más largo que puede ser un rango exacto (`from` y `to`). */
export const MAX_SPAN_DAYS = 366;

const instant = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'debe ser una fecha, por ejemplo 2026-10-01');

const base = z.object({
  workspaceId: z.uuid(),
  funnelId: z.uuid().optional(),
  range: z.enum(Object.keys(RANGE_DAYS) as [keyof typeof RANGE_DAYS, ...(keyof typeof RANGE_DAYS)[]]).optional(),
  from: instant.optional(),
  to: instant.optional(),
});

type Raw = z.infer<typeof base>;

/**
 * El periodo: `range` (7d, 30d o 90d) o un rango exacto con `from` y `to` (`from` incluido, `to` sin incluir;
 * una fecha sola vale su medianoche UTC). Sin nada, los últimos 30 días.
 */
function toPeriod(raw: Raw, ctx: z.RefinementCtx): Period {
  const fail = (path: string, message: string) => {
    ctx.addIssue({ code: 'custom', path: [path], message });
    return z.NEVER;
  };
  const exact = raw.from !== undefined || raw.to !== undefined;
  if (raw.range && exact) return fail('range', 'no se combina con from y to');
  if (!exact) return { range: raw.range ?? '30d' };
  if (raw.from === undefined || raw.to === undefined) return fail(raw.from === undefined ? 'from' : 'to', 'from y to van juntos');

  const from = new Date(raw.from);
  const to = new Date(raw.to);
  if (from >= to) return fail('to', 'debe ser posterior a from');
  if (to.getTime() - from.getTime() > MAX_SPAN_DAYS * DAY_MS) return fail('to', `el rango puede durar hasta ${MAX_SPAN_DAYS} días`);
  return { from, to };
}

export interface AnalyticsQuery {
  workspaceId: string;
  funnelId?: string;
  period: Period;
}

/** `workspaceId`, `funnelId` (opcional) y el periodo de todas las rutas de `/analytics`. */
export const analyticsQuerySchema = base.transform((raw, ctx): AnalyticsQuery => ({ workspaceId: raw.workspaceId, funnelId: raw.funnelId, period: toPeriod(raw, ctx) }));

/** `GET /analytics/drop-off`: las secciones son de una página, así que el funnel es obligatorio. */
export const dropOffQuerySchema = base
  .extend({ funnelId: z.uuid() })
  .transform((raw, ctx): AnalyticsQuery & { funnelId: string } => ({ workspaceId: raw.workspaceId, funnelId: raw.funnelId, period: toPeriod(raw, ctx) }));
