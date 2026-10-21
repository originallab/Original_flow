/**
 * Salir de la aplicación hacia otra dirección (por ejemplo, después de registrarse en una página
 * publicada). Está aparte para poder probarlo: el navegador de las pruebas no navega de verdad.
 */
export const navigation = {
  to(url: string) {
    window.location.assign(url);
  },
};
