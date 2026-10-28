/**
 * Dónde se guarda el token de sesión en el navegador. Está aislado en este archivo a propósito:
 * el playbook pide NO usar localStorage para tokens, y falta confirmar con Original Auth si el
 * acceso real usará una cookie HttpOnly. Mientras tanto se usa sessionStorage (se borra al cerrar
 * la pestaña) y cambiar el mecanismo solo toca este archivo.
 */
const KEY = 'of-session';

const PENDING_KEY = 'of-pending-login';

/** Un inicio de sesión que se mandó a Original Auth y todavía no regresa: la sesión que se creó y a dónde ir al terminar. */
export interface PendingLogin {
  session: string;
  from: string;
}

/** Solo rutas de esta misma aplicación: nunca una dirección externa (ni `//otro.sitio`) a la que redirigir después del login. */
export const isLocalPath = (path: unknown): path is string => typeof path === 'string' && /^\/(?![/\\])/.test(path);

export const sessionStore = {
  /** La sesión que espera a que Original Auth la valide (el mismo valor será el token cuando regrese). Se guarda aquí, junto al token. */
  getPending(): PendingLogin | null {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      const value: unknown = raw ? JSON.parse(raw) : null;
      if (value === null || typeof value !== 'object') return null;
      const { session, from } = value as Record<string, unknown>;
      if (typeof session !== 'string' || session === '') return null;
      return { session, from: isLocalPath(from) ? from : '/' };
    } catch {
      return null;
    }
  },
  setPending(pending: PendingLogin): void {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch {
      // Sin almacenamiento: el regreso de Original Auth no podrá retomar el inicio de sesión.
    }
  },
  clearPending(): void {
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      // Nada que borrar.
    }
  },
  get(): string | null {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      sessionStorage.setItem(KEY, token);
    } catch {
      // Sin almacenamiento disponible: la sesión dura lo que dure esta carga de la página.
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // Nada que borrar.
    }
  },
};
