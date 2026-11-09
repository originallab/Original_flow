/**
 * Las reglas de las etapas del tablero de leads, las mismas del backend (`lib/leadStages.ts` y `schemas/lead.schemas.ts`):
 * las usan la pantalla para saber qué ofrecer y la demostración para responder como el servidor real.
 */

/** Lo más largo que puede ser el nombre de una etapa y la posición más alta que acepta el servidor. */
export const MAX_STAGE_NAME = 60;
export const MAX_STAGE_ORDER = 100;

/** Qué le pasa al nombre de una etapa: el mensaje del problema, o `null` si es válido. */
export function stageNameProblem(name: unknown): string | null {
  if (typeof name !== 'string' || name.trim() === '') return 'Ponle un nombre a la etapa.';
  if (name.trim().length > MAX_STAGE_NAME) return `El nombre puede tener hasta ${MAX_STAGE_NAME} caracteres.`;
  return null;
}

export interface StageLike {
  id: string;
  isFinal: boolean;
}

/**
 * Dónde cae una etapa al agregarla o moverla, como posición dentro de `others` (las demás etapas, en orden, sin la que
 * se coloca; base 0). La etapa final siempre queda al final del tablero, así que nada se coloca después de ella. Sin
 * `requestedOrder` (posición pedida, base 1) cae justo antes de la final, o al final si no hay etapa final.
 */
export function insertionIndex(others: readonly StageLike[], requestedOrder?: number): number {
  const finalAt = others.findIndex((stage) => stage.isFinal);
  const last = finalAt === -1 ? others.length : finalAt;
  const wanted = requestedOrder === undefined ? last : requestedOrder - 1;
  return Math.min(Math.max(wanted, 0), last);
}

/** La lista con `placed` insertada en `index`, sin tocar la original. */
export function withPlaced<T>(others: readonly T[], placed: T, index: number): T[] {
  const result = [...others];
  result.splice(index, 0, placed);
  return result;
}
