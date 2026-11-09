import { apiFetch } from './api';
import type { Currency, FunnelObjective, FunnelStatus } from './funnels';

/** Los periodos que ofrece el dashboard: los últimos 7, 30 o 90 días. */
export const RANGES = [
  { value: '7d', label: '7 días', days: 7 },
  { value: '30d', label: '30 días', days: 30 },
  { value: '90d', label: '90 días', days: 90 },
] as const;
export type Range = (typeof RANGES)[number]['value'];

/** Lo que se pregunta: el negocio, un funnel (opcional) y el periodo. */
export interface AnalyticsQuery {
  workspaceId: string;
  funnelId?: string;
  range: Range;
}

/** Un valor del periodo y el del periodo anterior, del mismo tamaño, para ver la variación. */
export interface Compared {
  value: number;
  previous: number;
}

/** Dinero por divisa: cada funnel cobra en la suya, así que nunca se suman monedas distintas. */
export interface Money {
  currency: Currency;
  value: number;
  previous: number;
}

/** `GET /analytics/summary` */
export interface AnalyticsSummary {
  visits: Compared;
  leads: Compared;
  /** Porcentaje de visitas que dejaron sus datos. */
  conversion: Compared;
  /** Vacío mientras no haya ventas. */
  revenue: Money[];
  averageTicket: Money[];
}

export type StageKey = 'visits' | 'leads' | 'opportunities' | 'checkout' | 'payments' | 'customers';

/** Una etapa del embudo de conversión (`GET /analytics/funnel-conversion`). */
export interface ConversionStage {
  key: StageKey;
  label: string;
  count: number;
  /** Porcentaje de las visitas; `null` si no hubo visitas. */
  percentOfVisits: number | null;
  /** Porcentaje de la etapa anterior; `null` en la primera o si la anterior está en cero. */
  percentOfPrevious: number | null;
}

/** De dónde llegaron las visitas (`GET /analytics/sources`). */
export interface SourceRow {
  source: string;
  clicks: number;
  percent: number;
  /** Porcentaje de esas visitas que dejaron sus datos. */
  conversion: number;
}

/** Cuántas visitas llegan a cada sección de la página (`GET /analytics/drop-off`). */
export interface DropOffRow {
  section: string;
  reachedPercent: number;
  /** Puntos porcentuales que se pierden respecto a la sección anterior. */
  dropPoints: number;
}

/** El rendimiento de un funnel (`GET /analytics/funnels`). */
export interface FunnelPerformance {
  funnelId: string;
  name: string;
  objective: FunnelObjective;
  status: FunnelStatus;
  visits: number;
  leads: number;
  conversion: number;
  revenue: Money[];
}

function path(endpoint: string, { workspaceId, funnelId, range }: AnalyticsQuery): string {
  const query = new URLSearchParams({ workspaceId, range });
  if (funnelId) query.set('funnelId', funnelId);
  return `/analytics/${endpoint}?${query.toString()}`;
}

export const getSummary = (token: string, query: AnalyticsQuery, signal?: AbortSignal): Promise<AnalyticsSummary> => apiFetch(path('summary', query), { token, signal });

export async function getFunnelConversion(token: string, query: AnalyticsQuery, signal?: AbortSignal): Promise<ConversionStage[]> {
  const result = await apiFetch<{ items: ConversionStage[] }>(path('funnel-conversion', query), { token, signal });
  return result.items;
}

export async function getSources(token: string, query: AnalyticsQuery, signal?: AbortSignal): Promise<{ total: number; items: SourceRow[] }> {
  return apiFetch(path('sources', query), { token, signal });
}

/** El abandono por sección solo tiene sentido para una página: `funnelId` es obligatorio. */
export async function getDropOff(token: string, query: AnalyticsQuery & { funnelId: string }, signal?: AbortSignal): Promise<DropOffRow[]> {
  const result = await apiFetch<{ items: DropOffRow[] }>(path('drop-off', query), { token, signal });
  return result.items;
}

export async function getFunnelsPerformance(token: string, query: AnalyticsQuery, signal?: AbortSignal): Promise<FunnelPerformance[]> {
  const result = await apiFetch<{ items: FunnelPerformance[] }>(path('funnels', query), { token, signal });
  return result.items;
}
