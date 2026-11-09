import type { FunnelObjective } from '@/services/funnels';
import type { Block } from './blocks/types';
import { FUNNEL_TYPES, validateTypeConfig } from './funnelTypes';

/** Un requisito que todavía falta para poder publicar (lo mismo que devuelve el backend en `FUNNEL_NOT_READY`). */
export interface PublishProblem {
  code: string;
  message: string;
  /** Campo o bloque al que se refiere, si aplica. */
  field?: string;
}

export interface PublishCta {
  blockKey: string;
  actionType: string;
  destination: string | null;
}

export interface PublishInput {
  objective: FunnelObjective;
  price: number | null;
  typeConfig: unknown;
  blocks: Block[];
  ctas: PublishCta[];
  /** ¿Tiene el negocio Original Pay conectado? `null` = no se sabe (solo lo sabe el servidor). */
  hasPayments: boolean | null;
}

/**
 * Todo lo que debe cumplir un funnel antes de publicarse, con las mismas reglas del backend
 * (`findPublishProblems` en funnelPublish.service.ts). El editor lo usa para mostrar el checklist
 * antes de intentar publicar; el servidor siempre vuelve a comprobarlo y manda la última palabra.
 */
export function findPublishProblems({ objective, price, typeConfig, blocks, ctas, hasPayments }: PublishInput): PublishProblem[] {
  const problems: PublishProblem[] = [];
  const def = FUNNEL_TYPES[objective];

  if (blocks.length === 0) problems.push({ code: 'CONTENT_EMPTY', message: 'La página no tiene ningún bloque', field: 'content' });

  const issues = validateTypeConfig(objective, typeConfig);
  if (issues.length > 0) {
    const fields = [...new Set(issues.map((issue) => issue.path.join('.') || 'typeConfig'))];
    problems.push({ code: 'TYPE_CONFIG_INCOMPLETE', message: `Faltan ajustes del tipo de funnel: ${fields.join(', ')}`, field: 'typeConfig' });
  }

  if (def.primaryCta === 'form_submit' && !blocks.some((block) => block.type === 'formulario')) {
    problems.push({ code: 'FORM_MISSING', message: 'Este tipo de funnel necesita un formulario', field: 'content' });
  }
  if (def.primaryCta === 'checkout' && !ctas.some((cta) => cta.actionType === 'checkout')) {
    problems.push({ code: 'CHECKOUT_BUTTON_MISSING', message: 'Falta un botón de pago', field: 'content' });
  }

  if (def.charges) {
    if (price == null || price <= 0) problems.push({ code: 'PRICE_MISSING', message: 'Falta el precio del producto', field: 'price' });
    if (hasPayments === false) problems.push({ code: 'PAYMENTS_NOT_CONNECTED', message: 'El workspace no tiene Original Pay conectado' });
  }

  for (const cta of ctas) {
    if (cta.actionType === 'url' && !cta.destination) {
      problems.push({ code: 'CTA_DESTINATION_MISSING', message: `El botón "${cta.blockKey}" no tiene destino`, field: cta.blockKey });
    }
  }
  return problems;
}
