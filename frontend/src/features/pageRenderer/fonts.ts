import { useEffect, type CSSProperties } from 'react';
import { fontsHref, type PageTheme } from './theme';

/** Carga las tipografías de la página (Google Fonts) una sola vez por pareja de tipografías. */
export function useGoogleFonts(fonts: { heading: string; body: string }) {
  const href = fontsHref(fonts);
  useEffect(() => {
    if (document.head.querySelector(`link[data-page-fonts][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.pageFonts = '';
    document.head.appendChild(link);
  }, [href]);
}

/** La clase que lleva todo contenedor de página con `fontStyle`: hace que sus títulos (`font-heading`) usen la tipografía de la página. */
export const PAGE_FONTS_CLASS = 'page-fonts';

/** Las tipografías de la página como estilo: la del texto y la variable que usan los títulos (ver `index.css`). */
export function fontStyle(theme: PageTheme): CSSProperties {
  return { fontFamily: `'${theme.fonts.body}', var(--font-sans)`, '--page-heading': `'${theme.fonts.heading}', var(--font-sans)` } as CSSProperties;
}
