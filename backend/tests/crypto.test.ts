import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../src/lib/crypto.js';
import { baseEnv, testConfig } from './helpers/testApp.js';

const KEY = randomBytes(32).toString('hex');
const OTHER_KEY = randomBytes(32).toString('hex');

describe('cifrado de secretos (AES-256-GCM)', () => {
  it('descifra lo que cifró', () => {
    expect(decryptSecret(encryptSecret('app_ak_9f82d1c3a7b45e', KEY), KEY)).toBe('app_ak_9f82d1c3a7b45e');
  });

  it('el texto cifrado no contiene el secreto y cambia en cada cifrado', () => {
    const a = encryptSecret('mi-llave-secreta', KEY);
    const b = encryptSecret('mi-llave-secreta', KEY);
    expect(a).not.toContain('mi-llave-secreta');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
  });

  it('no se puede descifrar con otra clave', () => {
    expect(() => decryptSecret(encryptSecret('secreto', KEY), OTHER_KEY)).toThrow();
  });

  it('detecta un texto cifrado modificado', () => {
    const [version, iv, tag, data] = encryptSecret('secreto', KEY).split(':') as [string, string, string, string];
    const alterado = [version, iv, tag, Buffer.from('otro-contenido').toString('base64')].join(':');
    expect(() => decryptSecret(alterado, KEY)).toThrow();
    expect(() => decryptSecret([version, iv, Buffer.from('x'.repeat(16)).toString('base64'), data].join(':'), KEY)).toThrow();
  });

  it('rechaza un formato desconocido y una clave de tamaño incorrecto', () => {
    expect(() => decryptSecret('texto-suelto', KEY)).toThrow(/Formato/);
    expect(() => encryptSecret('secreto', 'abcd')).toThrow(/32 bytes/);
  });
});

describe('PAYMENT_CONFIG_ENCRYPTION_KEY en la configuración', () => {
  it('acepta 64 caracteres hexadecimales y rechaza cualquier otra cosa', () => {
    expect(testConfig({ PAYMENT_CONFIG_ENCRYPTION_KEY: KEY }).paymentConfigEncryptionKey).toBe(KEY);
    expect(() => testConfig({ PAYMENT_CONFIG_ENCRYPTION_KEY: 'corta' })).toThrow(/PAYMENT_CONFIG_ENCRYPTION_KEY/);
    expect(() => testConfig({ PAYMENT_CONFIG_ENCRYPTION_KEY: 'z'.repeat(64) })).toThrow(/PAYMENT_CONFIG_ENCRYPTION_KEY/);
  });

  it('es opcional en desarrollo y obligatoria en producción', () => {
    expect(testConfig().paymentConfigEncryptionKey).toBeUndefined();
    expect(() => testConfig({ NODE_ENV: 'production', AUTH_MODE: 'real' })).toThrow(/PAYMENT_CONFIG_ENCRYPTION_KEY/);
    expect(testConfig({ NODE_ENV: 'production', AUTH_MODE: 'real', PAYMENT_CONFIG_ENCRYPTION_KEY: KEY }).env).toBe('production');
    expect(baseEnv.PAYMENT_CONFIG_ENCRYPTION_KEY).toBeUndefined();
  });
});
