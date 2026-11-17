/**
 * Saca el objeto JSON de lo que respondió el modelo. La guía de IA Engine no ofrece un «modo JSON», así que
 * aunque se le pida solo JSON puede venir envuelto en un bloque de código o con una frase antes o después.
 * Devuelve `undefined` si no hay un objeto JSON válido.
 */
export function extractJsonObject(text: string): unknown {
  const candidates: string[] = [text.trim()];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch {
      // Se prueba con el siguiente candidato.
    }
  }
  return undefined;
}
