import type { Block, DesignSpec } from '@/shared/blocks/types';
import { apiFetch } from './api';

/** Tipos de funnel (`objective` en el backend). Hoy se pueden crear los que no están marcados como «próximamente». */
export const OBJECTIVES = ['leads', 'venta', 'citas', 'magnet', 'webinar', 'aplicacion', 'upsell', 'libre'] as const;
export type FunnelObjective = (typeof OBJECTIVES)[number];
export type FunnelStatus = 'draft' | 'published';
export type Currency = 'MXN' | 'USD' | 'CLP';

/** Lo que devuelve `GET /funnels` (sin el contenido pesado). */
export interface FunnelSummary {
  id: string;
  workspaceId: string;
  name: string;
  objective: FunnelObjective;
  status: FunnelStatus;
  language: string;
  slug: string;
  productName: string | null;
  price: number | null;
  currency: Currency;
  targetAudience: string | null;
  createdAt: string;
  updatedAt: string;
}

/** El funnel completo (`GET /funnels/:id`): lo que carga el editor. */
export interface Funnel extends FunnelSummary {
  typeConfig: unknown | null;
  brandBrief: unknown | null;
  designSpec: DesignSpec | null;
  content: { blocks: Block[] };
  seo: unknown | null;
  flow: unknown | null;
}

/** Datos de los pasos del asistente para crear el funnel en borrador. */
export interface NewFunnel {
  workspaceId: string;
  name: string;
  objective: FunnelObjective;
  productName?: string;
  price?: number;
  currency?: Currency;
  targetAudience?: string;
  language?: string;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type CtaActionType = 'url' | 'form_submit' | 'scroll_to' | 'checkout';

/** El llamado a la acción de un botón o formulario de la página (nace y muere con su bloque). */
export interface Cta {
  id: string;
  funnelId: string;
  blockKey: string;
  label: string;
  actionType: CtaActionType;
  destination: string | null;
  trackingId: string | null;
}

/** Lo que se puede cambiar de un funnel (`PATCH /funnels/:id`); con `null` se borran los opcionales. */
export interface FunnelChanges {
  name?: string;
  productName?: string | null;
  price?: number | null;
  currency?: Currency;
  targetAudience?: string | null;
  slug?: string;
  language?: string;
}

export interface CtaChanges {
  actionType?: CtaActionType;
  destination?: string | null;
  trackingId?: string | null;
}

/** GET /funnels: los funnels del negocio, del más nuevo al más viejo. */
export async function listFunnels(token: string, workspaceId: string): Promise<FunnelSummary[]> {
  const page = await apiFetch<Page<FunnelSummary>>(`/funnels?workspaceId=${encodeURIComponent(workspaceId)}&pageSize=100`, { token });
  return page.items;
}

/** POST /funnels: crea un funnel en borrador, con el contenido vacío. */
export function createFunnel(token: string, body: NewFunnel): Promise<Funnel> {
  return apiFetch('/funnels', { method: 'POST', body, token });
}

/** GET /funnels/:id */
export function getFunnel(token: string, id: string): Promise<Funnel> {
  return apiFetch(`/funnels/${encodeURIComponent(id)}`, { token });
}

/** PUT /funnels/:id/content: reemplaza el contenido de la página (el autoguardado del editor). */
export function saveContent(token: string, id: string, blocks: Block[]): Promise<{ blocks: Block[]; updatedAt: string }> {
  return apiFetch(`/funnels/${encodeURIComponent(id)}/content`, { method: 'PUT', body: { blocks }, token });
}

/** PUT /funnels/:id/design-spec: plantilla, paleta y tipografías. */
export function saveDesignSpec(token: string, id: string, designSpec: DesignSpec): Promise<{ designSpec: DesignSpec }> {
  return apiFetch(`/funnels/${encodeURIComponent(id)}/design-spec`, { method: 'PUT', body: designSpec, token });
}

/** PATCH /funnels/:id: nombre, precio, divisa, slug… (`409 SLUG_TAKEN` si el slug ya lo usa otro funnel). */
export function updateFunnel(token: string, id: string, changes: FunnelChanges): Promise<Funnel> {
  return apiFetch(`/funnels/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes, token });
}

/** PUT /funnels/:id/type-config: los ajustes propios del tipo de funnel (se validan completos). */
export function saveTypeConfig(token: string, id: string, typeConfig: Record<string, unknown>): Promise<{ typeConfig: Record<string, unknown> }> {
  return apiFetch(`/funnels/${encodeURIComponent(id)}/type-config`, { method: 'PUT', body: typeConfig, token });
}

/** GET /funnels/:id/ctas */
export function listCtas(token: string, id: string): Promise<Cta[]> {
  return apiFetch(`/funnels/${encodeURIComponent(id)}/ctas`, { token });
}

/** PATCH /funnels/:id/ctas/:blockKey: destino, tipo de acción o seguimiento de un botón o formulario. */
export function updateCta(token: string, id: string, blockKey: string, changes: CtaChanges): Promise<Cta> {
  return apiFetch(`/funnels/${encodeURIComponent(id)}/ctas/${encodeURIComponent(blockKey)}`, { method: 'PATCH', body: changes, token });
}

/** POST /funnels/:id/publish: `422 FUNNEL_NOT_READY` con `details.missing` si todavía falta algo. Si ya estaba publicado no hace nada. */
export function publishFunnel(token: string, id: string): Promise<Funnel> {
  return apiFetch(`/funnels/${encodeURIComponent(id)}/publish`, { method: 'POST', token });
}

/** POST /funnels/:id/unpublish: vuelve a borrador sin borrar nada. */
export function unpublishFunnel(token: string, id: string): Promise<Funnel> {
  return apiFetch(`/funnels/${encodeURIComponent(id)}/unpublish`, { method: 'POST', token });
}
