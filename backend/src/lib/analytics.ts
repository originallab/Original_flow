/** Cálculos puros de la analítica del dashboard (sin base de datos): periodos, porcentajes, dinero y origen de un lead. */

export const DAY_MS = 86_400_000;
export const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;
export type RangeKey = keyof typeof RANGE_DAYS;

/** Un periodo: desde `from` (incluido) hasta `to` (sin incluir). */
export interface Window {
  from: Date;
  to: Date;
}

/** Lo que se pidió: los últimos N días, o un rango exacto (`from` y `to`). */
export type Period = { range: RangeKey } | { from: Date; to: Date };

/** El periodo pedido y el anterior, del mismo tamaño y pegado a él, para calcular la variación. */
export function windowsFor(period: Period, now: Date): { current: Window; previous: Window } {
  const current: Window =
    'range' in period ? { from: new Date(now.getTime() - RANGE_DAYS[period.range] * DAY_MS), to: now } : { from: period.from, to: period.to };
  const length = current.to.getTime() - current.from.getTime();
  return { current, previous: { from: new Date(current.from.getTime() - length), to: current.from } };
}

export const round = (value: number, digits = 1): number => Math.round(value * 10 ** digits) / 10 ** digits;

/** Porcentaje con un decimal; 0 si no hay con qué comparar. */
export const percent = (part: number, whole: number): number => (whole > 0 ? round((part / whole) * 100) : 0);

/** Lo que se pagó en una divisa en un periodo. */
export interface PaidTotal {
  currency: string;
  sum: number;
  count: number;
}

export interface Money {
  currency: string;
  value: number;
  previous: number;
}

/**
 * Ingresos y ticket promedio por divisa, de este periodo y del anterior. Cada funnel cobra en la suya,
 * así que nunca se suman divisas distintas; sin ventas, las listas quedan vacías.
 */
export function moneyRows(now: PaidTotal[], before: PaidTotal[]): { revenue: Money[]; averageTicket: Money[] } {
  const current = new Map(now.map((total) => [total.currency, total]));
  const previous = new Map(before.map((total) => [total.currency, total]));
  const currencies = [...new Set([...current.keys(), ...previous.keys()])].sort();
  const sum = (total?: PaidTotal) => round(total?.sum ?? 0, 2);
  const average = (total?: PaidTotal) => (total && total.count > 0 ? round(total.sum / total.count, 2) : 0);
  return {
    revenue: currencies.map((currency) => ({ currency, value: sum(current.get(currency)), previous: sum(previous.get(currency)) })),
    averageTicket: currencies.map((currency) => ({ currency, value: average(current.get(currency)), previous: average(previous.get(currency)) })),
  };
}

export const DIRECT = 'Directo';

/**
 * De dónde llegó un lead: la fuente de la campaña (`utm_source`), el sitio del que vino o «Directo». Es la
 * misma regla con la que la página publicada manda el origen de cada visita, para poder compararlos.
 * `utm` viene de la base y se lee de forma defensiva.
 */
export function leadSource(utm: unknown): string {
  if (utm === null || typeof utm !== 'object' || Array.isArray(utm)) return DIRECT;
  const { utm_source: source, referrer } = utm as Record<string, unknown>;
  if (typeof source === 'string' && source.trim()) return source.trim();
  if (typeof referrer === 'string' && referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (host) return host;
    } catch {
      // Un referente que no es una dirección válida no cuenta.
    }
  }
  return DIRECT;
}
