/**
 * Las imágenes de la demostración (sin servidor): cada una vive solo en el navegador, con una dirección temporal (`blob:`).
 * Sirve para que el modo demostración pueda mostrar el logo elegido; no se guarda al recargar la página.
 */
const urls = new Map<string, string>();

export const rememberDemoAsset = (id: string, url: string): void => void urls.set(id, url);
export const demoAssetUrl = (id: string | null): string | null => (id ? (urls.get(id) ?? null) : null);
