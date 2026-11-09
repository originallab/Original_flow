import type { Currency, NewFunnel } from '@/services/funnels';
import { goalOf } from '../catalog';
import type { GenerationInput } from './types';

/**
 * Saca un monto de un texto libre («$1,490 MXN», «4200», «USD 99.90»). Devuelve `null` si no hay un
 * número («Gratis»). La divisa se reconoce por su nombre; si no aparece, MXN.
 */
export function parsePrice(text: string): { amount: number; currency: Currency } | null {
  const match = /\d[\d.,]*/.exec(text);
  if (!match) return null;
  const digits = match[0].replace(/[.,]+$/, '');
  // «1,490» y «1,490.50» usan la coma de millares; «99,90» usa la coma decimal.
  const normalized = /,\d{1,2}$/.test(digits) && !/\./.test(digits) ? digits.replace(',', '.') : digits.replace(/,/g, '');
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const currency: Currency = /\busd\b|us\$|d[oó]lar/i.test(text) ? 'USD' : /\bclp\b|chilen/i.test(text) ? 'CLP' : 'MXN';
  return { amount, currency };
}

const clip = (value: string, max: number) => value.trim().slice(0, max);

/** Los datos para crear el funnel en borrador (`POST /funnels`) a partir de lo que dijo la persona. Lo opcional vacío no se manda. */
export function toNewFunnel(input: GenerationInput): NewFunnel {
  const { brief, objective, workspace } = input;
  const price = objective === 'venta' ? parsePrice(brief.price) : null;
  const productName = clip(brief.offer, 200);
  const targetAudience = clip(brief.audience, 300);
  return {
    workspaceId: workspace.id,
    name: clip(brief.name.trim() === '' ? goalOf(objective).name : brief.name, 120),
    objective,
    ...(productName ? { productName } : {}),
    ...(targetAudience ? { targetAudience } : {}),
    ...(price ? { price: price.amount, currency: price.currency } : {}),
    language: 'es',
  };
}
