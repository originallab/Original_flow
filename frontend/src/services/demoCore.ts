import { ApiError } from './apiError';
import type { Cta, Currency, Funnel } from './funnels';
import type { LeadStage } from './leads';
import type { Member } from './members';
import type { OrderStatus } from './publicPages';
import type { PaymentsConnection } from '@/shared/payments';
import type { Workspace } from './workspaces';

/** Piezas comunes del modo demostración (ver demo.ts): la «base de datos» en el navegador y los errores con el formato del backend. */

export interface DemoSession {
  email: string;
  name: string | null;
  validated: boolean;
}

export type DemoWorkspace = Workspace & { ownerEmail: string };

/** Un lead que llegó desde el formulario de una página publicada. */
export interface DemoLead {
  id: string;
  funnelId: string;
  name?: string;
  email?: string;
  phone?: string;
  utm: { utm_source?: string; utm_medium?: string; utm_campaign?: string; referrer?: string };
  source: 'web_form';
  customFields: Record<string, string | number | boolean | null>;
  /** Etapa del tablero; los leads de antes de existir el tablero no la traen y cuentan como de la primera. */
  leadStageId?: string;
  value?: number | null;
  createdAt: string;
}

/** Un evento de la página (visitas, secciones vistas, clics) o generado por el servidor (lead creado). */
export interface DemoEvent {
  id: string;
  funnelId: string;
  type: string;
  properties: Record<string, string>;
  createdAt: string;
}

/** Una versión guardada de la página: quién la guardó, su nombre y una copia de lo que se versiona. */
export interface DemoHistoryEntry {
  id: string;
  funnelId: string;
  userEmail: string;
  label: string | null;
  snapshot: { content: unknown; designSpec: unknown; brandBrief: unknown; seo: unknown; flow: unknown };
  createdAt: string;
}

/** Una compra en una página publicada: lo que se va a cobrar y en qué va. El monto sale del precio del funnel, nunca del navegador. */
export interface DemoOrder {
  id: string;
  publicToken: string;
  funnelId: string;
  leadId: string;
  orderNumber: string;
  amount: number;
  currency: Currency;
  status: OrderStatus;
  paymentMethod: string | null;
  idempotencyKey: string;
  customerEmail: string;
  createdAt: string;
  paidAt: string | null;
}

export interface DemoDb {
  sessions: Record<string, DemoSession>;
  workspaces: DemoWorkspace[];
  funnels: Funnel[];
  ctas: Cta[];
  history: DemoHistoryEntry[];
  orders: DemoOrder[];
  /** Original Pay conectado por negocio (sin la llave: en la demostración se descarta). */
  payments: Record<string, Pick<PaymentsConnection, 'currency' | 'methods'>>;
  leadStages: LeadStage[];
  /** Las personas invitadas a los negocios (el dueño de cada negocio no se guarda aquí: sale del propio negocio). */
  members: Member[];
  leads: DemoLead[];
  events: DemoEvent[];
}

export const uuid = () => crypto.randomUUID();
export const fail = (status: number, code: string, message: string, details: unknown = {}) => new ApiError(status, code, message, details, 'req_demo');
export const unauthorized = () => fail(401, 'UNAUTHORIZED', 'Autenticación requerida o inválida');
export const notFound = (code = 'NOT_FOUND', message = 'Recurso no encontrado') => fail(404, code, message);
export const invalid = (details: { path: string; message: string }[]) => fail(422, 'VALIDATION_ERROR', 'Datos inválidos', details);
export const asObject = (body: unknown): Record<string, unknown> => (body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {});

/** Lo que reciben los endpoints de funnels de la demostración. */
export interface FunnelsContext {
  route: string;
  query: URLSearchParams;
  method: string;
  data: Record<string, unknown>;
  db: DemoDb;
  /** La persona de la sesión (lanza 401 si no hay una válida). */
  sessionOf: () => DemoSession;
  /** Guarda los cambios de la base de demostración. */
  save: () => void;
}

export type Answer = { handled: false } | { handled: true; value: unknown };
export const done = (value: unknown): Answer => ({ handled: true, value });
export const skip: Answer = { handled: false };

/** Un funnel de los negocios de la persona (404 si no existe o es de otra persona, nunca 403). */
export function ownFunnel({ db, sessionOf }: FunnelsContext, id: string): Funnel {
  const session = sessionOf();
  const funnel = db.funnels.find((f) => f.id === id);
  const mine = funnel && db.workspaces.some((w) => w.id === funnel.workspaceId && w.ownerEmail === session.email);
  if (!funnel || !mine) throw notFound('FUNNEL_NOT_FOUND', 'Funnel no encontrado');
  return funnel;
}

/** Guarda una versión con la copia de la página tal como está ahora (la usan publicar y el historial). */
export function recordVersion(db: DemoDb, funnel: Funnel, userEmail: string, label: string | null): DemoHistoryEntry {
  const entry: DemoHistoryEntry = {
    id: uuid(),
    funnelId: funnel.id,
    userEmail,
    label,
    snapshot: structuredClone({ content: funnel.content, designSpec: funnel.designSpec, brandBrief: funnel.brandBrief, seo: funnel.seo, flow: funnel.flow }),
    createdAt: new Date().toISOString(),
  };
  db.history.push(entry);
  return entry;
}
