import { validateSession, type ValidateResponse } from './auth';

/**
 * El camino REAL de Original Auth: el front crea una sesión (`GET /auth/session`), manda a la persona a la
 * pantalla de inicio de sesión de Original Auth, esta llama al callback del backend (`POST /auth/callback`) y
 * regresa a `/auth/return`, donde se consulta `POST /auth/validate` hasta que la sesión queda validada.
 *
 * La dirección de la pantalla de inicio de sesión (y cómo se llaman sus parámetros) la define Original Auth,
 * no este proyecto: por eso es una plantilla que se pone en `VITE_ORIGINALAUTH_LOGIN_URL`, con `{session}` y,
 * si hace falta, `{token_app}` donde Original Auth los espera. Nada de esto lleva secretos: el `secret_key`
 * vive solo en el backend.
 */

/** Cada cuánto se pregunta si la sesión ya quedó validada y cuántas veces (en pruebas se acortan). */
export const authTiming = { intervalMs: 1500, maxPolls: 20 };

export interface RealAuthConfig {
  tokenApp: string;
  loginUrlTemplate: string;
}

/** La dirección es de confianza solo si es https (o http hacia la propia máquina, para probar en local). */
function isSafeLoginUrl(url: URL): boolean {
  return url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
}

/** La configuración del acceso real, o `null` si falta algo o la plantilla no sirve. */
export function realAuthConfig(): RealAuthConfig | null {
  const tokenApp = import.meta.env.VITE_TOKEN_APP?.trim();
  const template = import.meta.env.VITE_ORIGINALAUTH_LOGIN_URL?.trim();
  if (!tokenApp || !template || !template.includes('{session}')) return null;
  try {
    const sample = new URL(template.replaceAll('{session}', 'x').replaceAll('{token_app}', 'x'));
    if (!isSafeLoginUrl(sample)) return null;
  } catch {
    return null;
  }
  return { tokenApp, loginUrlTemplate: template };
}

export const isRealAuthConfigured = (): boolean => realAuthConfig() !== null;

/** La dirección a la que se manda a la persona para iniciar sesión con esta sesión. */
export function buildLoginUrl(session: string): string {
  const config = realAuthConfig();
  if (!config) throw new Error('El acceso con Original Auth no está configurado');
  return config.loginUrlTemplate.replaceAll('{session}', encodeURIComponent(session)).replaceAll('{token_app}', encodeURIComponent(config.tokenApp));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Pregunta una y otra vez si la sesión ya quedó validada. La primera consulta es inmediata (Original Auth ya
 * pudo haber llamado al callback cuando la persona regresa) y un fallo de red en una consulta no corta la
 * espera: se vuelve a preguntar. Devuelve la validación, o `null` si no se validó a tiempo.
 */
export async function waitForValidation(session: string): Promise<Extract<ValidateResponse, { validated: 1 }> | null> {
  for (let poll = 0; poll < authTiming.maxPolls; poll += 1) {
    if (poll > 0) await sleep(authTiming.intervalMs);
    try {
      const validation = await validateSession(session);
      if (validation.validated === 1) return validation;
    } catch {
      // Sin conexión por un momento: se intenta de nuevo en la siguiente vuelta.
    }
  }
  return null;
}
