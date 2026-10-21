import type { Money } from '@/services/analytics';

const count = new Intl.NumberFormat('es');
const compact = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });

/** Un conteo: completo hasta las decenas de miles y compacto desde ahí («12,9 mil»). */
export const formatCount = (value: number): string => (value >= 10_000 ? compact.format(value) : count.format(value));

/** Un porcentaje con hasta un decimal («12,5 %»). */
export const formatPercent = (value: number): string => `${decimal.format(value)} %`;

/** Dinero en su divisa. */
export const formatMoney = ({ currency, value }: Pick<Money, 'currency' | 'value'>): string => new Intl.NumberFormat('es', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);

export type VariationKind = 'up' | 'down' | 'flat' | 'new' | 'none';
export interface Variation {
  kind: VariationKind;
  /** Cuánto cambió: en porcentaje o, para valores que ya son porcentajes, en puntos. */
  amount: number;
}

// `|| 0` evita el cero negativo (-0) cuando una diferencia diminuta se redondea a cero.
const round = (value: number) => Math.round(value * 10) / 10 || 0;

/**
 * Cómo cambió un valor frente al periodo anterior. Con `points` se resta (para porcentajes, como la
 * conversión); si no, se calcula el porcentaje de cambio. Desde cero no hay porcentaje: es «nuevo».
 */
export function variation(value: number, previous: number, mode: 'percent' | 'points' = 'percent'): Variation {
  if (value === 0 && previous === 0) return { kind: 'none', amount: 0 };
  if (mode === 'points') {
    const amount = round(value - previous);
    return { kind: amount > 0 ? 'up' : amount < 0 ? 'down' : 'flat', amount };
  }
  if (previous === 0) return { kind: 'new', amount: 0 };
  const amount = round(((value - previous) / previous) * 100);
  return { kind: amount > 0 ? 'up' : amount < 0 ? 'down' : 'flat', amount };
}

/** El texto de una variación: «+12 %», «−1,2 pts», «Sin cambios», «Nuevo» o «—». */
export function describeVariation({ kind, amount }: Variation, mode: 'percent' | 'points' = 'percent'): string {
  if (kind === 'none') return '—';
  if (kind === 'flat') return 'Sin cambios';
  if (kind === 'new') return 'Nuevo';
  const number = decimal.format(Math.abs(amount));
  return `${kind === 'up' ? '+' : '−'}${number}${mode === 'points' ? ' pts' : ' %'}`;
}

/** El nombre de una sección de la página a partir de su clave («testimonios-2» → «Testimonios 2»). */
export function sectionLabel(key: string): string {
  const spaced = key.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** El paso de la rampa (1 a 6) para la etapa `index` de `total`, repartidos de la más clara a la más intensa. */
export function rampStep(index: number, total: number): number {
  return total <= 1 ? 1 : Math.round((index * 5) / (total - 1)) + 1;
}
