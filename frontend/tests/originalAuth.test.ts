import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/features/auth/sessionStore';
import * as authService from '@/services/auth';
import { authTiming, buildLoginUrl, isRealAuthConfigured, realAuthConfig, waitForValidation } from '@/services/originalAuth';

const PLANTILLA = 'https://auth.ejemplo.com/login?app={token_app}&session={session}';

function configurar(tokenApp: string | undefined, plantilla: string | undefined) {
  vi.stubEnv('VITE_TOKEN_APP', tokenApp as string);
  vi.stubEnv('VITE_ORIGINALAUTH_LOGIN_URL', plantilla as string);
}

const original = { ...authTiming };
beforeEach(() => {
  authTiming.intervalMs = 1;
  authTiming.maxPolls = 3;
});
afterEach(() => {
  Object.assign(authTiming, original);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

describe('configuración del acceso real', () => {
  it('sin el token de la aplicación o sin la plantilla no está configurado', () => {
    configurar(undefined, undefined);
    expect(realAuthConfig()).toBeNull();
    configurar('app-1', undefined);
    expect(isRealAuthConfigured()).toBe(false);
    configurar(undefined, PLANTILLA);
    expect(isRealAuthConfigured()).toBe(false);
    configurar('   ', PLANTILLA);
    expect(isRealAuthConfigured()).toBe(false);
  });

  it('la plantilla debe llevar {session}', () => {
    configurar('app-1', 'https://auth.ejemplo.com/login?app={token_app}');
    expect(isRealAuthConfigured()).toBe(false);
  });

  it('solo se acepta https (o http hacia la propia máquina) y una dirección válida', () => {
    for (const plantilla of ['http://auth.ejemplo.com/login?s={session}', 'javascript:alert({session})', 'ftp://auth.ejemplo.com/{session}', 'no es una dirección {session}', '//auth.ejemplo.com/{session}']) {
      configurar('app-1', plantilla);
      expect(isRealAuthConfigured(), plantilla).toBe(false);
    }
    for (const plantilla of ['https://auth.ejemplo.com/login?s={session}', 'http://localhost:4000/login?s={session}', 'http://127.0.0.1/login?s={session}']) {
      configurar('app-1', plantilla);
      expect(isRealAuthConfigured(), plantilla).toBe(true);
    }
  });

  it('recorta los espacios de lo configurado', () => {
    configurar('  app-1  ', `  ${PLANTILLA}  `);
    expect(realAuthConfig()).toEqual({ tokenApp: 'app-1', loginUrlTemplate: PLANTILLA });
  });
});

describe('dirección de inicio de sesión', () => {
  it('pone la sesión y el token de la aplicación, codificados, donde Original Auth los espera', () => {
    configurar('app 1&x', 'https://auth.ejemplo.com/login?app={token_app}&session={session}&otra={session}');
    expect(buildLoginUrl('abc-123')).toBe('https://auth.ejemplo.com/login?app=app%201%26x&session=abc-123&otra=abc-123');
    expect(buildLoginUrl('a/b?c=d&e')).toContain('session=a%2Fb%3Fc%3Dd%26e');
  });

  it('si {token_app} aparece varias veces, se reemplaza en todas', () => {
    configurar('app-1', 'https://auth.ejemplo.com/{token_app}/login?app={token_app}&session={session}');
    expect(buildLoginUrl('abc')).toBe('https://auth.ejemplo.com/app-1/login?app=app-1&session=abc');
  });

  it('una plantilla sin {token_app} también sirve', () => {
    configurar('app-1', 'https://auth.ejemplo.com/{session}');
    expect(buildLoginUrl('abc')).toBe('https://auth.ejemplo.com/abc');
  });

  it('sin configuración lanza un error en vez de mandar a ningún lado', () => {
    configurar(undefined, undefined);
    expect(() => buildLoginUrl('abc')).toThrow(/no está configurado/i);
  });
});

describe('esperar la validación', () => {
  const validada = { validated: 1 as const, userId: 'u1', email: 'a@correo.com', profileComplete: false };

  it('si ya está validada responde con la primera consulta, sin esperar', async () => {
    const validar = vi.spyOn(authService, 'validateSession').mockResolvedValue(validada);
    expect(await waitForValidation('s1')).toEqual(validada);
    expect(validar).toHaveBeenCalledTimes(1);
    expect(validar).toHaveBeenCalledWith('s1');
  });

  it('la primera consulta no espera el intervalo', async () => {
    authTiming.intervalMs = 60_000;
    vi.spyOn(authService, 'validateSession').mockResolvedValue(validada);
    // Si esperara antes de preguntar, esto tardaría un minuto y la prueba se agotaría.
    expect(await waitForValidation('s1')).toEqual(validada);
  });

  it('sigue preguntando hasta que se valida', async () => {
    const validar = vi.spyOn(authService, 'validateSession').mockResolvedValueOnce({ validated: 0 }).mockResolvedValueOnce({ validated: 0 }).mockResolvedValueOnce(validada);
    expect(await waitForValidation('s1')).toEqual(validada);
    expect(validar).toHaveBeenCalledTimes(3);
  });

  it('un fallo de red en una consulta no corta la espera', async () => {
    const validar = vi.spyOn(authService, 'validateSession').mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(validada);
    expect(await waitForValidation('s1')).toEqual(validada);
    expect(validar).toHaveBeenCalledTimes(2);
  });

  it('si nunca se valida devuelve nulo después de todas las consultas', async () => {
    const validar = vi.spyOn(authService, 'validateSession').mockResolvedValue({ validated: 0 });
    expect(await waitForValidation('s1')).toBeNull();
    expect(validar).toHaveBeenCalledTimes(3);
  });

  it('con puros errores de red también termina (nulo), sin lanzar', async () => {
    vi.spyOn(authService, 'validateSession').mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await waitForValidation('s1')).toBeNull();
  });
});

describe('inicio de sesión pendiente', () => {
  it('guarda la sesión y a dónde volver, y se puede descartar', () => {
    expect(sessionStore.getPending()).toBeNull();
    sessionStore.setPending({ session: 's1', from: '/funnels?x=1' });
    expect(sessionStore.getPending()).toEqual({ session: 's1', from: '/funnels?x=1' });
    sessionStore.clearPending();
    expect(sessionStore.getPending()).toBeNull();
  });

  it('vive en sessionStorage y nunca en localStorage', () => {
    sessionStore.setPending({ session: 's1', from: '/' });
    expect(sessionStorage.length).toBe(1);
    expect(localStorage.length).toBe(0);
  });

  it('un destino que no es una ruta de esta aplicación se cambia por la raíz', () => {
    for (const from of ['https://otro.sitio/robar', '//otro.sitio', '/\\otro.sitio', 'javascript:alert(1)', '', 'funnels', 7, null]) {
      sessionStorage.setItem('of-pending-login', JSON.stringify({ session: 's1', from }));
      expect(sessionStore.getPending(), String(from)).toEqual({ session: 's1', from: '/' });
    }
  });

  it('lo guardado dañado o sin sesión se lee como si no hubiera nada', () => {
    for (const raw of ['no es json', 'null', '7', '"texto"', '{}', '{"session":""}', '{"session":5}']) {
      sessionStorage.setItem('of-pending-login', raw);
      expect(sessionStore.getPending(), raw).toBeNull();
    }
  });

  it('si el almacenamiento está bloqueado no lanza errores', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(sessionStore.getPending()).toBeNull();
    expect(() => sessionStore.setPending({ session: 's1', from: '/' })).not.toThrow();
    expect(() => sessionStore.clearPending()).not.toThrow();
  });
});
