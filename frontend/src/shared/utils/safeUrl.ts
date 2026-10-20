/**
 * Un enlace que viene de los datos del funnel (destino de un botón, calendario, enlace del evento…)
 * solo se usa si es `http` o `https`. Un `javascript:` o un `data:` también son direcciones válidas
 * para el navegador, y ponerlos en un `href` permitiría ejecutar código en la página del visitante.
 * Devuelve la dirección normalizada, o `null` si no se debe usar.
 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
