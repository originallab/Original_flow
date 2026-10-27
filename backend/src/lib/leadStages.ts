/** Reglas puras del orden de las etapas del tablero de leads (sin base de datos). */

export interface StageLike {
  id: string;
  isFinal: boolean;
}

/**
 * Dónde cae una etapa al agregarla o moverla, como posición dentro de `others` (las demás etapas, en orden,
 * sin la que se coloca; base 0). La etapa final siempre queda al final del tablero, así que nada se coloca
 * después de ella. Sin `requestedOrder` (posición pedida, base 1) cae justo antes de la final, o al final si
 * no hay etapa final. Una posición fuera de rango se acerca a la más cercana válida.
 */
export function insertionIndex(others: readonly StageLike[], requestedOrder?: number): number {
  const finalAt = others.findIndex((stage) => stage.isFinal);
  const last = finalAt === -1 ? others.length : finalAt;
  const wanted = requestedOrder === undefined ? last : requestedOrder - 1;
  return Math.min(Math.max(wanted, 0), last);
}

/** Las etapas en su nuevo orden: `others` con `placed` insertada en `index`. */
export function withPlaced<T>(others: readonly T[], placed: T, index: number): T[] {
  const result = [...others];
  result.splice(index, 0, placed);
  return result;
}
