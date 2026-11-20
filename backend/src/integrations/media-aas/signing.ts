import { createHash, createHmac } from 'node:crypto';

const EMPTY_BODY_HASH = createHash('sha256').update('').digest('hex');

/**
 * Firma HMAC-SHA256 de MediaAAS (su documentación técnica). Mensaje canónico de cuatro líneas:
 * MÉTODO, RUTA con la query ordenada alfabéticamente, TIMESTAMP (segundos) y SHA-256 del cuerpo.
 * EXCEPCIÓN: en `multipart/form-data` el cuerpo NO se hashea (se usa el hash del texto vacío): la integridad
 * del binario se delega a TLS. El `Content-Type` no entra en la firma.
 */
/** La ruta que se firma: sin host, con la ruta decodificada y la query ordenada alfabéticamente. */
export function canonicalPath(path: string): string {
  const url = new URL(path, 'https://mediaas.invalid');
  const query = url.search.slice(1).split('&').filter(Boolean).sort().join('&');
  return decodeURIComponent(url.pathname) + (query ? `?${query}` : '');
}

export function signRequest(secretKey: string, method: string, path: string, timestamp: number, body: Uint8Array | 'multipart'): string {
  path = canonicalPath(path);
  const bodyHash = body === 'multipart' ? EMPTY_BODY_HASH : createHash('sha256').update(body).digest('hex');
  return `sha256=${createHmac('sha256', secretKey).update(`${method}\n${path}\n${timestamp}\n${bodyHash}`).digest('hex')}`;
}
