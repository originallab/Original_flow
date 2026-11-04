import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/services/api';
import { listFunnels, type FunnelSummary } from '@/services/funnels';
import { createLead, createStage, deleteStage, listLeads, listLeadStages, updateLead, updateStage, type Lead, type LeadChanges, type LeadFilters, type LeadStage, type NewLead } from '@/services/leads';

type Load = 'loading' | 'ready' | 'error';

export const MOVE_FAILED = 'No se pudo mover el lead. Inténtalo de nuevo.';

/** Cómo salió un guardado: bien, o con el error de cada campo y/o un mensaje general. */
export type SaveResult = { ok: true } | { ok: false; fields: Record<string, string>; message?: string };

/** Por qué no se pudo cambiar una etapa, dicho para quien administra el tablero. */
function stageFailure(err: unknown): SaveResult {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.code === 'STAGE_NOT_EMPTY') return { ok: false, fields: {}, message: 'Mueve primero los leads de esta etapa y vuelve a intentarlo.' };
    if (err.status === 409 && err.code === 'STAGE_PROTECTED') return { ok: false, fields: {}, message: 'Esa etapa no se puede mover ni quitar: es la última del tablero y la que se usa cuando alguien paga.' };
    if (err.status === 422) return { ok: false, fields: err.fieldErrors(), message: Object.keys(err.fieldErrors()).length === 0 ? 'Revisa los datos de la etapa.' : undefined };
    if (err.status === 404) return { ok: false, fields: {}, message: 'Ya no se encontró la etapa. Recarga la pantalla.' };
    if (err.status === 403) return { ok: false, fields: {}, message: 'Solo quien administra el negocio puede cambiar las etapas.' };
  }
  return { ok: false, fields: {}, message: 'No se pudo guardar. Inténtalo de nuevo.' };
}

function failure(err: unknown): SaveResult {
  if (err instanceof ApiError && err.status === 422) return { ok: false, fields: err.fieldErrors() };
  if (err instanceof ApiError && err.status === 404) return { ok: false, fields: {}, message: 'Ya no se encontró lo que intentabas guardar. Recarga la pantalla.' };
  return { ok: false, fields: {}, message: 'No se pudo guardar. Inténtalo de nuevo.' };
}

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
  const [leadsAttempt, setLeadsAttempt] = useState(0);
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
  }, [enabled, token, workspaceId, filters, attempt, leadsAttempt]);

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

  /** Da de alta un lead a mano y vuelve a pedir la lista (el nuevo puede no coincidir con los filtros puestos). */
  const create = useCallback(
    async (body: NewLead): Promise<SaveResult> => {
      if (!token) return { ok: false, fields: {}, message: 'Tu sesión terminó. Vuelve a entrar.' };
      try {
        await createLead(token, body);
        setLeadsAttempt((n) => n + 1);
        return { ok: true };
      } catch (err) {
        return failure(err);
      }
    },
    [token],
  );

  /** Corrige los datos de un lead (nombre, correo, teléfono) y/o lo asigna. */
  const saveDetails = useCallback(
    async (leadId: string, changes: Pick<LeadChanges, 'name' | 'email' | 'phone' | 'assignedTo'>): Promise<SaveResult> => {
      if (!token) return { ok: false, fields: {}, message: 'Tu sesión terminó. Vuelve a entrar.' };
      try {
        patchLead(leadId, await updateLead(token, leadId, changes));
        return { ok: true };
      } catch (err) {
        return failure(err);
      }
    },
    [token, patchLead],
  );

  /** Hace un cambio en las etapas y, si salió bien, vuelve a pedir el tablero tal como quedó (los órdenes se renumeran en el servidor). */
  const changeStages = useCallback(
    async (run: (token: string, workspaceId: string) => Promise<unknown>): Promise<SaveResult> => {
      if (!token || !workspaceId) return { ok: false, fields: {}, message: 'Tu sesión terminó. Vuelve a entrar.' };
      try {
        await run(token, workspaceId);
      } catch (err) {
        return stageFailure(err);
      }
      try {
        setStages(await listLeadStages(token, workspaceId));
      } catch {
        return { ok: false, fields: {}, message: 'El cambio se guardó, pero no se pudo actualizar la lista. Recarga la pantalla.' };
      }
      return { ok: true };
    },
    [token, workspaceId],
  );
  const addStage = useCallback((name: string) => changeStages((t, w) => createStage(t, w, { name })), [changeStages]);
  const renameStage = useCallback((id: string, name: string) => changeStages((t) => updateStage(t, id, { name })), [changeStages]);
  const moveStage = useCallback((id: string, order: number) => changeStages((t) => updateStage(t, id, { order })), [changeStages]);
  const removeStage = useCallback((id: string) => changeStages((t) => deleteStage(t, id)), [changeStages]);

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
    create,
    saveDetails,
    addStage,
    renameStage,
    moveStage,
    removeStage,
  };
}
