import type { CustomFieldValue, Utm } from '@/shared/leads';
import { apiFetch } from './api';

/** Una etapa del tablero de leads del negocio (`GET /workspaces/:id/lead-stages`). */
export interface LeadStage {
  id: string;
  workspaceId: string;
  name: string;
  order: number;
  /** Última etapa del tablero. */
  isFinal: boolean;
  /** Etapa a la que pasa un lead cuando paga. */
  isWon: boolean;
}

/** Un lead tal como lo muestra el tablero (`GET /leads`). */
export interface Lead {
  id: string;
  funnelId: string;
  funnelName: string;
  leadStageId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: 'web_form' | 'whatsapp';
  utm: Utm | null;
  assignedTo: string | null;
  /** Valor estimado del lead. */
  value: number | null;
  customFields: Record<string, CustomFieldValue> | null;
  createdAt: string;
}

/** Filtros de la lista: el funnel de origen y un texto que se busca en nombre, correo y teléfono. */
export interface LeadFilters {
  funnelId?: string;
  q?: string;
}

/** Lo que se puede cambiar de un lead (`PATCH /leads/:id`); con `null` se borra el valor, el vendedor, el nombre, el correo o el teléfono. */
export interface LeadChanges {
  leadStageId?: string;
  value?: number | null;
  /** El id de la persona (de `userId` en el equipo) a la que se asigna, o `null` para quitarla. */
  assignedTo?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Un lead dado de alta a mano (`POST /leads`): sin etapa entra a la primera del tablero. */
export interface NewLead {
  funnelId: string;
  leadStageId?: string;
  name?: string;
  email?: string;
  phone?: string;
  value?: number;
  source?: Lead['source'];
}

export interface LeadsPage {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

/** Cuántos leads trae el tablero de una vez (el máximo que permite la API). */
export const BOARD_PAGE_SIZE = 100;

interface StagesPage {
  items: LeadStage[];
}

/** GET /workspaces/:id/lead-stages: las etapas del tablero, en orden. */
export async function listLeadStages(token: string, workspaceId: string, signal?: AbortSignal): Promise<LeadStage[]> {
  const page = await apiFetch<StagesPage>(`/workspaces/${encodeURIComponent(workspaceId)}/lead-stages`, { token, signal });
  return [...page.items].sort((a, b) => a.order - b.order);
}

/** POST /workspaces/:id/lead-stages: agrega una etapa (sin posición, justo antes de la final). Solo quien administra el negocio. */
export function createStage(token: string, workspaceId: string, body: { name: string; order?: number }): Promise<LeadStage> {
  return apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}/lead-stages`, { method: 'POST', body, token });
}

/** PATCH /lead-stages/:id: renombra o mueve una etapa (`order`: 1 es la primera). La final no se mueve. */
export function updateStage(token: string, id: string, changes: { name?: string; order?: number }): Promise<LeadStage> {
  return apiFetch(`/lead-stages/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes, token });
}

/** DELETE /lead-stages/:id: quita la etapa. Responde 409 si es la final o la ganada, o si todavía tiene leads. */
export function deleteStage(token: string, id: string): Promise<void> {
  return apiFetch(`/lead-stages/${encodeURIComponent(id)}`, { method: 'DELETE', token });
}

/** GET /leads: los leads del negocio, del más nuevo al más viejo. */
export function listLeads(token: string, workspaceId: string, filters: LeadFilters = {}, signal?: AbortSignal): Promise<LeadsPage> {
  const query = new URLSearchParams({ workspaceId, pageSize: String(BOARD_PAGE_SIZE) });
  if (filters.funnelId) query.set('funnelId', filters.funnelId);
  if (filters.q?.trim()) query.set('q', filters.q.trim());
  return apiFetch(`/leads?${query.toString()}`, { token, signal });
}

/** POST /leads: da de alta un lead a mano en un funnel del negocio. */
export function createLead(token: string, body: NewLead): Promise<Lead> {
  return apiFetch('/leads', { method: 'POST', body, token });
}

/** PATCH /leads/:id: pasa el lead a otra etapa, le pone su valor estimado, lo asigna o corrige sus datos. */
export function updateLead(token: string, id: string, changes: LeadChanges): Promise<Lead> {
  return apiFetch(`/leads/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes, token });
}
