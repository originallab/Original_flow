import { createHash, createHmac } from 'node:crypto';

/**
 * Firma HMAC-SHA256 de IA Engine (guía de integración). El mensaje canónico tiene cuatro líneas:
 *
 *     MÉTODO
 *     RUTA (con la query ordenada, si la lleva)
 *     TIMESTAMP (segundos, Unix)
 *     SHA-256 EN HEXADECIMAL DEL CUERPO (de los bytes exactos que se envían; vacío en un GET)
 *
 * La firma va en `X-Signature` como `sha256=<hex>`. El `secret_key` nunca viaja: solo firma.
 */
export function signRequest(secretKey: string, method: string, path: string, timestamp: number, body: Uint8Array): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const canonical = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
  return `sha256=${createHmac('sha256', secretKey).update(canonical).digest('hex')}`;
}
