import type { AfterSubmit } from '@/shared/afterSubmit';
import type { Block, DesignSpec } from '@/shared/blocks/types';
import type { LeadBody } from '@/shared/leads';
import { apiFetch } from './api';
import type { CtaActionType, Currency, FunnelObjective } from './funnels';

/** Los endpoints públicos: los usa el visitante de una página publicada, sin sesión (docs/API_MVP.md → Endpoints públicos). */

export interface PublicCta {
  blockKey: string;
  label: string;
  actionType: CtaActionType;
  destination: string | null;
  trackingId: string | null;
}

export interface PublicSeo {
  title?: string;
  description?: string;
  indexable?: boolean;
}

/** Lo que devuelve `GET /public/pages/:slug`: lo necesario para dibujar la página (sin ids, sin marca interna ni ajustes del tipo). */
export interface PublicPage {
  slug: string;
  name: string;
  objective: FunnelObjective;
  language: string;
  price: number | null;
  currency: Currency;
  content: { blocks: Block[] };
  designSpec: DesignSpec | null;
  seo: PublicSeo | null;
  ctas: PublicCta[];
}

export interface LeadResponse {
  ok: true;
  /** Lo que se muestra o se hace después de registrarse. `null` si el tipo no tiene pantalla posterior. */
  next: AfterSubmit | null;
}

/** Los únicos tipos de evento que puede mandar el navegador (los demás los genera el servidor). */
export type ClientEventType = 'page_view' | 'section_view' | 'button_click';

export interface ClientEvent {
  type: ClientEventType;
  properties?: { source?: string; section?: string; blockKey?: string };
}

/** GET /public/pages/:slug: `404 PAGE_NOT_FOUND` si no existe o está en borrador. */
export function getPublicPage(slug: string, signal?: AbortSignal): Promise<PublicPage> {
  return apiFetch(`/public/pages/${encodeURIComponent(slug)}`, { signal });
}

/** POST /public/funnels/:slug/leads: guarda el lead y devuelve lo que sigue (`next`). */
export function sendLead(slug: string, body: LeadBody): Promise<LeadResponse> {
  return apiFetch(`/public/funnels/${encodeURIComponent(slug)}/leads`, { method: 'POST', body });
}

/** POST /public/funnels/:slug/events: de 1 a 20 eventos por petición. `keepalive` deja que termine aunque se cierre la página. */
export function sendEvents(slug: string, events: ClientEvent[], keepalive = false): Promise<{ accepted: number }> {
  return apiFetch(`/public/funnels/${encodeURIComponent(slug)}/events`, { method: 'POST', body: { events }, keepalive });
}
