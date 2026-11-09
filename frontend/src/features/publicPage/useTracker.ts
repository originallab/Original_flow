import { useCallback, useEffect, useRef } from 'react';
import { sendEvents, type ClientEvent } from '@/services/publicPages';
import { MAX_BATCH, TRACK_DELAY_MS } from './constants';

/**
 * Mide lo que pasa en la página publicada (visita, secciones vistas y clics) y lo manda por lotes.
 * Es de mejor esfuerzo: si un lote falla no se reintenta ni se le avisa a la persona. Las secciones se
 * cuentan una sola vez por visita. Al ocultarse o cerrarse la página manda lo pendiente (`keepalive`).
 */
export function useTracker(slug: string, enabled: boolean) {
  const queue = useRef<ClientEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sections = useRef(new Set<string>());
  const viewed = useRef(false);

  const flush = useCallback(
    (keepalive = false) => {
      clearTimeout(timer.current);
      if (queue.current.length === 0) return;
      // La cola nunca pasa de MAX_BATCH: `track` la manda en cuanto se junta ese número.
      sendEvents(slug, queue.current.splice(0), keepalive).catch(() => undefined);
    },
    [slug],
  );

  const track = useCallback(
    (event: ClientEvent) => {
      if (!enabled) return;
      queue.current.push(event);
      if (queue.current.length >= MAX_BATCH) flush();
      else {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(), TRACK_DELAY_MS);
      }
    },
    [enabled, flush],
  );

  // Lo pendiente se manda al ocultar o cerrar la página y al salir de esta pantalla.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    const onPageHide = () => flush(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      flush(true);
    };
  }, [enabled, flush]);

  return {
    /** La visita (una sola vez). */
    pageView: useCallback(
      (source?: string) => {
        if (viewed.current) return;
        viewed.current = true;
        track({ type: 'page_view', properties: source ? { source } : {} });
      },
      [track],
    ),
    /** Una sección entró en pantalla (una sola vez por visita). */
    sectionView: useCallback(
      (section: string) => {
        if (sections.current.has(section)) return;
        sections.current.add(section);
        track({ type: 'section_view', properties: { section } });
      },
      [track],
    ),
    /** Un clic en un botón. */
    buttonClick: useCallback((blockKey: string) => track({ type: 'button_click', properties: { blockKey } }), [track]),
    flush,
  };
}
