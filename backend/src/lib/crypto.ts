import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado reversible para secretos de terceros que hay que volver a leer (la apikey de Original
 * Pay de cada workspace). Un hash no sirve aquí: no se puede recuperar el valor. Usa AES-256-GCM:
 * además de cifrar, detecta si alguien modificó el texto cifrado. La clave (32 bytes en
 * hexadecimal) vive solo en una variable de entorno, nunca en el repositorio ni en la base de datos.
 *
 * Formato guardado: `v1:<iv>:<etiqueta>:<texto cifrado>`, cada parte en base64.
 */
const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

function keyFrom(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('La clave de cifrado debe tener 32 bytes (64 caracteres hexadecimales)');
  return key;
}

export function encryptSecret(plain: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyFrom(keyHex), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

/** Descifra un valor guardado con `encryptSecret`. Lanza un error si la clave es otra o el texto fue alterado. */
export function decryptSecret(payload: string, keyHex: string): string {
  const [version, iv, tag, data] = payload.split(':');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Formato de secreto cifrado no reconocido');
  const decipher = createDecipheriv(ALGORITHM, keyFrom(keyHex), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
