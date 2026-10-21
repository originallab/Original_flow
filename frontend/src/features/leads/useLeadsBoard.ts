import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/services/api';
import { listFunnels, type FunnelSummary } from '@/services/funnels';
import { listLeads, listLeadStages, updateLead, type Lead, type LeadFilters, type LeadStage } from '@/services/leads';

type Load = 'loading' | 'ready' | 'error';

export const MOVE_FAILED = 'No se pudo mover el lead. Inténtalo de nuevo.';

/**
 * Lo que necesita el tablero de leads de un negocio: sus etapas, sus funnels (para filtrar), los leads con
 * los filtros puestos y las dos acciones que cambian un lead. Mover de etapa se ve al instante y, si el
 * servidor lo rechaza, el lead vuelve a donde estaba y se avisa.
 */
export function useLeadsBoard(token: string | null, workspaceId: string | undefined, enabled = true) {
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [funnels, setFunnels] = useState<FunnelSummary[]>([]);
  const [base, setBase] = useState<Load>('loading');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [leadsLoad, setLeadsLoad] = useState<Load>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<LeadFilters>({});
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const current = useRef<Lead[]>([]);
  const tickets = useRef(new Map<string, number>());
  const loadedOnce = useRef(false);
  current.current = leads;

  const patchLead = useCallback((id: string, changes: Partial<Lead>) => setLeads((previous) => previous.map((lead) => (lead.id === id ? { ...lead, ...changes } : lead))), []);

  // Un negocio distinto o un «Reintentar» empiezan de cero.
  useEffect(() => {
    if (!enabled || !token || !workspaceId) return;
    const controller = new AbortController();
    loadedOnce.current = false;
    setBase('loading');
    setLeadsLoad('loading');
    setLeads([]);
    Promise.all([listLeadStages(token, workspaceId, controller.signal), listFunnels(token, workspaceId)])
      .then(([loadedStages, loadedFunnels]) => {
        if (controller.signal.aborted) return;
        setStages(loadedStages);
        setFunnels(loadedFunnels);
        setBase('ready');
      })
      .catch(() => !controller.signal.aborted && setBase('error'));
    return () => controller.abort();
  }, [enabled, token, workspaceId, attempt]);

  // Los leads, cada vez que cambia un filtro; en las recargas se sigue viendo el tablero anterior.
  useEffect(() => {
    if (!enabled || !token || !workspaceId) return;
    const controller = new AbortController();
    if (loadedOnce.current) setRefreshing(true);
    listLeads(token, workspaceId, filters, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        loadedOnce.current = true;
        setLeads(page.items);
        setTotal(page.total);
        setLeadsLoad('ready');
        setRefreshing(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLeadsLoad('error');
        setRefreshing(false);
      });
    return () => controller.abort();
  }, [enabled, token, workspaceId, filters, attempt]);

  const move = useCallback(
    async (leadId: string, stageId: string): Promise<boolean> => {
      const lead = current.current.find((item) => item.id === leadId);
      if (!token || !lead || lead.leadStageId === stageId) return true;
      const previous = lead.leadStageId;
      // Solo cuenta la última petición de cada lead: si se movió dos veces seguidas, la anterior no pisa a la nueva.
      const ticket = (tickets.current.get(leadId) ?? 0) + 1;
      tickets.current.set(leadId, ticket);
      setNotice(null);
      patchLead(leadId, { leadStageId: stageId });
      try {
        const updated = await updateLead(token, leadId, { leadStageId: stageId });
        if (tickets.current.get(leadId) === ticket) patchLead(leadId, updated);
        return true;
      } catch {
        if (tickets.current.get(leadId) === ticket) {
          patchLead(leadId, { leadStageId: previous });
          setNotice(MOVE_FAILED);
        }
        return false;
      }
    },
    [token, patchLead],
  );

  /** Guarda el valor estimado. Devuelve el mensaje de error (para mostrarlo junto al campo) o `null` si se guardó. */
  const saveValue = useCallback(
    async (leadId: string, value: number | null): Promise<string | null> => {
      if (!token) return 'Tu sesión terminó. Vuelve a entrar.';
      try {
        patchLead(leadId, await updateLead(token, leadId, { value }));
        return null;
      } catch (err) {
        if (err instanceof ApiError && err.status === 422) return err.fieldErrors().value ?? 'Revisa el valor.';
        return 'No se pudo guardar. Inténtalo de nuevo.';
      }
    },
    [token, patchLead],
  );

  const status: Load = base === 'error' || leadsLoad === 'error' ? 'error' : base === 'loading' || leadsLoad === 'loading' ? 'loading' : 'ready';

  return {
    status,
    stages,
    funnels,
    leads,
    total,
    refreshing,
    filters,
    setFilters,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    retry: useCallback(() => setAttempt((n) => n + 1), []),
    move,
    saveValue,
  };
}
