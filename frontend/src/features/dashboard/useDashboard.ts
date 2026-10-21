import { useCallback, useEffect, useState } from 'react';
import { getDropOff, getFunnelConversion, getFunnelsPerformance, getSources, getSummary, type AnalyticsSummary, type ConversionStage, type DropOffRow, type FunnelPerformance, type Range, type SourceRow } from '@/services/analytics';
import { listFunnels, type FunnelSummary } from '@/services/funnels';

export interface DashboardData {
  summary: AnalyticsSummary;
  stages: ConversionStage[];
  sources: SourceRow[];
  /** `null` mientras no se elige un funnel: el abandono por sección es de una sola página. */
  dropOff: DropOffRow[] | null;
  performance: FunnelPerformance[];
}

/**
 * Todo lo que muestra el dashboard del negocio activo con los filtros puestos. Al cambiar un filtro se sigue
 * viendo lo anterior (`refreshing`) hasta que llega lo nuevo, sin saltos; si algo falla, todo se marca como error.
 */
export function useDashboard(token: string | null, workspaceId: string | undefined, funnelId: string, range: Range) {
  const [funnels, setFunnels] = useState<FunnelSummary[] | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Los funnels del negocio (para el filtro y para saber si todavía no hay ninguno).
  useEffect(() => {
    if (!token || !workspaceId) return;
    let cancelled = false;
    listFunnels(token, workspaceId)
      .then((items) => !cancelled && setFunnels(items))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [token, workspaceId, attempt]);

  useEffect(() => {
    if (!token || !workspaceId) return;
    const controller = new AbortController();
    const { signal } = controller;
    const query = { workspaceId, range, ...(funnelId ? { funnelId } : {}) };
    setFailed(false);
    setRefreshing(true);
    Promise.all([
      getSummary(token, query, signal),
      getFunnelConversion(token, query, signal),
      getSources(token, query, signal),
      funnelId ? getDropOff(token, { ...query, funnelId }, signal) : Promise.resolve(null),
      getFunnelsPerformance(token, query, signal),
    ])
      .then(([summary, stages, sources, dropOff, performance]) => {
        if (signal.aborted) return;
        setData({ summary, stages, sources: sources.items, dropOff, performance });
        setRefreshing(false);
      })
      .catch(() => {
        if (signal.aborted) return;
        setFailed(true);
        setRefreshing(false);
      });
    return () => controller.abort();
  }, [token, workspaceId, funnelId, range, attempt]);

  return {
    status: failed ? ('error' as const) : data && funnels ? ('ready' as const) : ('loading' as const),
    funnels: funnels ?? [],
    data,
    refreshing,
    retry: useCallback(() => setAttempt((n) => n + 1), []),
  };
}
