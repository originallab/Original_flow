import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, getMe, logoutSession, mockCallback, validateSession } from '@/services/auth';
import { createFakeBackend, MOCK_ENV, stubMockEnv, type FakeBackend } from './helpers/fakeBackend';

let backend: FakeBackend;
beforeEach(() => {
  stubMockEnv();
  backend = createFakeBackend();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('servicio de autenticación', () => {
  it('createSession pide una sesión nueva al backend', async () => {
    const { session } = await createSession();
    expect(session).toMatch(/^[0-9a-f-]{36}$/);
    expect(backend.calls[0]).toMatchObject({ method: 'GET', path: '/auth/session' });
  });

  it('mockCallback manda al backend el cuerpo que enviaría Original Auth (snake_case)', async () => {
    const { session } = await createSession();
    const res = await mockCallback(session, { email: 'ana@correo.com', name: 'Ana' });
    expect(res).toEqual({ validated: 1 });
    expect(backend.callsTo('/auth/callback')[0]?.body).toEqual({
      token_app: MOCK_ENV.token,
      secret_key: MOCK_ENV.secret,
      session,
      email: 'ana@correo.com',
      name: 'Ana',
    });
  });

  it('mockCallback no manda el nombre si está vacío', async () => {
    const { session } = await createSession();
    await mockCallback(session, { email: 'ana@correo.com' });
    expect(backend.callsTo('/auth/callback')[0]?.body).not.toHaveProperty('name');
  });

  it('validateSession, getMe (con Bearer) y logoutSession usan las rutas del backend', async () => {
    const token = backend.seedSession('ana@correo.com', 'Ana');
    expect(await validateSession(token)).toMatchObject({ validated: 1, email: 'ana@correo.com' });
    expect((await getMe(token)).user.email).toBe('ana@correo.com');
    expect(backend.callsTo('/me')[0]?.authorization).toBe(`Bearer ${token}`);
    await logoutSession(token);
    expect(backend.callsTo(`/auth/session/${token}`)[0]?.method).toBe('DELETE');
  });

  describe('el acceso simulado solo existe en desarrollo', () => {
    it('no funciona si no es un entorno de desarrollo (compilación de producción)', () => {
      vi.stubEnv('DEV', false);
      expect(() => mockCallback('s', { email: 'a@b.com' })).toThrow(/solo está disponible en desarrollo/);
      expect(backend.callsTo('/auth/callback')).toHaveLength(0);
    });

    it('no funciona si VITE_AUTH_MODE no pide el modo simulado', () => {
      vi.stubEnv('VITE_AUTH_MODE', 'redirect');
      expect(() => mockCallback('s', { email: 'a@b.com' })).toThrow(/solo está disponible en desarrollo/);
      expect(backend.callsTo('/auth/callback')).toHaveLength(0);
    });
  });
});
