import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/index.js';
import { baseEnv, testConfig } from './helpers/testApp.js';

describe('loadConfig', () => {
  it('con las variables mínimas devuelve la configuración con valores por defecto', () => {
    const config = testConfig();
    expect(config.port).toBe(3000);
    expect(config.corsOrigins).toEqual(['http://localhost:5173']);
    expect(config.originalAuth.mode).toBe('real');
    expect(config.originalPay.baseUrl).toBe('https://api-test.origpay.com/');
    expect(config.session).toEqual({ pendingTtlMs: 15 * 60_000, ttlMs: 30 * 24 * 60 * 60_000 });
    expect(config.trustProxyHops).toBe(0);
  });

  it('exige las credenciales de Original Auth y nombra la variable que falta', () => {
    const { ORIGINALAUTH_SECRET_KEY: _omitida, ...sinSecreto } = baseEnv;
    expect(() => loadConfig(sinSecreto)).toThrow(/ORIGINALAUTH_SECRET_KEY/);
  });

  it('permite cambiar la vigencia de las sesiones por variables', () => {
    const config = testConfig({ SESSION_PENDING_TTL_MINUTES: '5', SESSION_TTL_DAYS: '7' });
    expect(config.session).toEqual({ pendingTtlMs: 5 * 60_000, ttlMs: 7 * 24 * 60 * 60_000 });
  });

  it('separa varios orígenes de CORS por coma', () => {
    const config = testConfig({ CORS_ORIGINS: 'http://localhost:5173, https://app.ejemplo.com' });
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'https://app.ejemplo.com']);
  });

  it('los orígenes de las páginas públicas son una lista aparte, vacía por defecto, y rechazan "*"', () => {
    expect(testConfig().publicCorsOrigins).toEqual([]);
    expect(testConfig({ PUBLIC_CORS_ORIGINS: 'https://a.com, https://b.com' }).publicCorsOrigins).toEqual(['https://a.com', 'https://b.com']);
    expect(() => testConfig({ PUBLIC_CORS_ORIGINS: '*' })).toThrow(/PUBLIC_CORS_ORIGINS/);
  });

  it('rechaza si falta DATABASE_URL y nombra la variable', () => {
    const { DATABASE_URL: _omitida, ...sinBase } = baseEnv;
    expect(() => loadConfig(sinBase)).toThrow(ConfigError);
    expect(() => loadConfig(sinBase)).toThrow(/DATABASE_URL/);
  });

  it('rechaza "*" como origen de CORS', () => {
    expect(() => testConfig({ CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
  });

  it('rechaza un puerto fuera de rango', () => {
    expect(() => testConfig({ PORT: '70000' })).toThrow(/PORT/);
  });

  it('rechaza AUTH_MODE=mock_callback en producción', () => {
    expect(() => testConfig({ NODE_ENV: 'production', AUTH_MODE: 'mock_callback' })).toThrow(/AUTH_MODE/);
  });

  it('permite AUTH_MODE=mock_callback en desarrollo', () => {
    const config = testConfig({ NODE_ENV: 'development', AUTH_MODE: 'mock_callback' });
    expect(config.originalAuth.mode).toBe('mock_callback');
  });

  it('el mensaje de error nunca incluye el valor de las variables', () => {
    try {
      testConfig({ ORIGINALAUTH_SECRET_KEY: 'secreto-super-privado', PORT: 'no-es-numero' });
    } catch (err) {
      expect((err as Error).message).not.toContain('secreto-super-privado');
      expect((err as Error).message).not.toContain('no-es-numero');
      return;
    }
    throw new Error('debía lanzar ConfigError');
  });
});
