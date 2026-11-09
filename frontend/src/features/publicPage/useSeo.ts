import { useEffect } from 'react';
import type { PublicPage } from '@/services/publicPages';

function setMeta(name: string, content: string | null): () => void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  const created = !element;
  const previous = element?.getAttribute('content') ?? null;
  if (content === null) return () => undefined;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('name', name);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
  return () => {
    if (created) element?.remove();
    else if (previous !== null) element?.setAttribute('content', previous);
  };
}

/**
 * El título, la descripción y la indexación de la página publicada (lo que dice su `seo`; si no hay
 * título, el nombre del funnel). Al salir de la página se deja todo como estaba.
 */
export function useSeo(page: PublicPage | null) {
  useEffect(() => {
    if (!page) return;
    const previousTitle = document.title;
    const previousLang = document.documentElement.lang;
    document.title = page.seo?.title?.trim() || page.name;
    document.documentElement.lang = page.language.split('-')[0] || 'es';
    const undoDescription = setMeta('description', page.seo?.description?.trim() || null);
    // Sin indicación se deja indexar; solo `indexable: false` pide lo contrario.
    const undoRobots = setMeta('robots', page.seo?.indexable === false ? 'noindex, nofollow' : null);
    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLang;
      undoDescription();
      undoRobots();
    };
  }, [page]);
}
