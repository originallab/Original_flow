/**
 * La última orden que la persona empezó a pagar. Original Pay la devuelve a una dirección FIJA
 * (`/pago/retorno`), así que antes de mandarla a pagar se recuerda el token de su orden en este navegador
 * (`sessionStorage`: se borra al cerrar la pestaña). Es solo el token público de la orden, nunca datos de pago.
 */
const KEY = 'of:lastOrder';

export function rememberOrder(publicToken: string): void {
  try {
    sessionStorage.setItem(KEY, publicToken);
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): el retorno usará lo que Original Pay agregue a la dirección.
  }
}

export function recallOrder(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
