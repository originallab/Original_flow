import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/services/api';
import type { Funnel } from '@/services/funnels';
import { listHistory, restoreVersion, saveVersion, type HistoryEntry } from '@/services/history';

type Load = 'loading' | 'ready' | 'error';

export type SaveResult = { ok: true } | { ok: false; message: string };
export type RestoreResult = { ok: true; funnel: Funnel } | { ok: false; message: string };

/** Las versiones guardadas de un funnel, y guardar o restaurar una con sus errores ya explicados. */
export function useHistory(token: string | null, funnelId: string) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoad('loading');
    listHistory(token, funnelId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setEntries(items);
        setLoad('ready');
      })
      .catch(() => !controller.signal.aborted && setLoad('error'));
    return () => controller.abort();
  }, [token, funnelId, attempt]);

  /** Vuelve a pedir la lista sin mostrar «Cargando…» (después de restaurar aparece una versión nueva). */
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setEntries(await listHistory(token, funnelId));
    } catch {
      // Se queda la lista que ya había.
    }
  }, [token, funnelId]);

  const save = useCallback(
    async (label: string): Promise<SaveResult> => {
      if (!token) return { ok: false, message: 'Tu sesión terminó. Vuelve a entrar.' };
      try {
        const entry = await saveVersion(token, funnelId, label);
        setEntries((previous) => [entry, ...previous]);
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError && err.status === 422) return { ok: false, message: err.fieldErrors().label ?? 'Revisa el nombre de la versión.' };
        return { ok: false, message: 'No se pudo guardar la versión. Inténtalo de nuevo.' };
      }
    },
    [token, funnelId],
  );

  const restore = useCallback(
    async (historyId: string): Promise<RestoreResult> => {
      if (!token) return { ok: false, message: 'Tu sesión terminó. Vuelve a entrar.' };
      try {
        const funnel = await restoreVersion(token, funnelId, historyId);
        await refresh();
        return { ok: true, funnel };
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          await refresh();
          return { ok: false, message: 'Esa versión ya no existe.' };
        }
        if (err instanceof ApiError && err.status === 403) return { ok: false, message: 'No tienes permiso para restaurar versiones.' };
        return { ok: false, message: 'No se pudo restaurar. Inténtalo de nuevo.' };
      }
    },
    [token, funnelId, refresh],
  );

  return { entries, load, save, restore, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}
