import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compara dos textos en tiempo constante, para que el tiempo de respuesta no
 * revele cuántos caracteres de un secreto coinciden. Se comparan sus hashes
 * porque `timingSafeEqual` exige buffers de igual longitud.
 */
export function safeEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}
