/** El nombre que se le da a una versión guardada a mano (`POST /funnels/:id/history`). */
export const MAX_LABEL = 120;

/** Qué le pasa al nombre de una versión: el mensaje del problema, o `null` si es válido. Lo usan el diálogo del historial y la demostración. */
export function labelProblem(label: unknown): string | null {
  if (typeof label !== 'string' || label.trim() === '') return 'Ponle un nombre a la versión.';
  if (label.trim().length > MAX_LABEL) return `El nombre puede tener hasta ${MAX_LABEL} caracteres.`;
  return null;
}
