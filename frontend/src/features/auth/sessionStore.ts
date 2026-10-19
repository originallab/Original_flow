/**
 * Dónde se guarda el token de sesión en el navegador. Está aislado en este archivo a propósito:
 * el playbook pide NO usar localStorage para tokens, y falta confirmar con Original Auth si el
 * acceso real usará una cookie HttpOnly. Mientras tanto se usa sessionStorage (se borra al cerrar
 * la pestaña) y cambiar el mecanismo solo toca este archivo.
 */
const KEY = 'of-session';

export const sessionStore = {
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
