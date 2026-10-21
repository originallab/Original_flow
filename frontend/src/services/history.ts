import { apiFetch } from './api';
import type { Funnel } from './funnels';

export interface HistoryUser {
  id: string;
  name: string | null;
  email: string;
}

/** Una versión guardada de la página (`GET /funnels/:id/history`). No trae la copia: pesa mucho y solo hace falta al restaurar. */
export interface HistoryEntry {
  id: string;
  funnelId: string;
  /** «Publicado», el nombre que le puso quien la guardó, o `null`. */
  label: string | null;
  createdAt: string;
  user: HistoryUser;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET /funnels/:id/history: las versiones, de la más nueva a la más vieja. */
export async function listHistory(token: string, funnelId: string, signal?: AbortSignal): Promise<HistoryEntry[]> {
  const page = await apiFetch<Page<HistoryEntry>>(`/funnels/${encodeURIComponent(funnelId)}/history?pageSize=100`, { token, signal });
  return page.items;
}

/** POST /funnels/:id/history: guarda la página como está ahora con un nombre. */
export function saveVersion(token: string, funnelId: string, label: string): Promise<HistoryEntry> {
  return apiFetch(`/funnels/${encodeURIComponent(funnelId)}/history`, { method: 'POST', body: { label }, token });
}

/**
 * POST /funnels/:id/history/:historyId/restore: devuelve la página a como estaba en esa versión (contenido,
 * diseño, marca, SEO y flujo; no el nombre, el precio ni los ajustes del tipo) y responde el funnel ya restaurado.
 * Antes guarda como estaba la página en una versión nueva, para poder deshacer.
 */
export function restoreVersion(token: string, funnelId: string, historyId: string): Promise<Funnel> {
  return apiFetch(`/funnels/${encodeURIComponent(funnelId)}/history/${encodeURIComponent(historyId)}/restore`, { method: 'POST', token });
}
