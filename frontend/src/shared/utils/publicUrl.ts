/**
 * La dirección pública de una página publicada. En producción la arma el servicio de dominios de la
 * empresa a partir del `slug` (docs/API_MVP.md → Dominios); mientras tanto, la propia aplicación la
 * dibuja en `/p/:slug`.
 */
export const publicPath = (slug: string) => `/p/${slug}`;

export const publicUrl = (slug: string) => `${window.location.origin}${publicPath(slug)}`;
