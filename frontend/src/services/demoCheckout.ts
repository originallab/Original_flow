import { isIdempotencyKey, validateCheckout, type CheckoutBody } from '@/shared/payments';
import { normalizeLead } from '@/shared/leads';
import { FUNNEL_TYPES } from '@/shared/funnelTypes';
import { done, fail, invalid, notFound, skip, uuid, type Answer, type DemoDb, type DemoLead, type DemoOrder } from './demoCore';
import { stagesOf } from './demoLeads';
import type { Funnel } from './funnels';
import type { OrderView } from './publicPages';

/**
 * La compra en la página pública en la demostración (ver demoPublic.ts), con las reglas de
 * `docs/API_MVP.md`: clave de idempotencia obligatoria, el monto sale del precio del funnel y un
 * reintento nunca crea otra orden. Nada se cobra: «Original Pay» es una página de mentira
 * (`/demo/pago/:token`, solo en desarrollo) donde se elige si el pago sale bien o mal.
 */

interface Context {
  route: string;
  method: string;
  data: Record<string, unknown>;
  headers: Record<string, string>;
  db: DemoDb;
  save: () => void;
}

const headerOf = (headers: Record<string, string>, name: string) => Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];

function view(funnel: Funnel, order: DemoOrder): OrderView {
  const config = (funnel.typeConfig ?? {}) as { successMessage?: string; successUrl?: string };
  return {
    publicToken: order.publicToken,
    status: order.status,
    ...(order.status === 'paid' ? { ...(config.successMessage ? { message: config.successMessage } : {}), ...(config.successUrl ? { redirectUrl: config.successUrl } : {}) } : {}),
  };
}

/** El lead de esa compra: el que ya dejó ese correo en el funnel o uno nuevo en la primera etapa del tablero. */
function leadFor(db: DemoDb, funnel: Funnel, body: CheckoutBody): DemoLead {
  const normalized = normalizeLead({ ...body, consent: true });
  const existing = db.leads.find((lead) => lead.funnelId === funnel.id && lead.email === normalized.email);
  if (existing) return existing;
  const now = new Date().toISOString();
  const lead: DemoLead = {
    id: uuid(),
    funnelId: funnel.id,
    ...normalized,
    source: 'web_form',
    customFields: { _consentAt: now },
    leadStageId: stagesOf(db, funnel.workspaceId)[0]?.id,
    value: null,
    createdAt: now,
  };
  db.leads.push(lead);
  db.events.push({ id: uuid(), funnelId: funnel.id, type: 'lead_created', properties: normalized.utm.utm_source ? { source: normalized.utm.utm_source } : {}, createdAt: now });
  return lead;
}

export function demoCheckoutRoute({ route, method, data, headers, db, save }: Context, publishedBySlug: (db: DemoDb, slug: string) => Funnel): Answer {
  const checkout = /^\/public\/funnels\/([^/]+)\/checkout$/.exec(route);
  if (checkout && method === 'POST') {
    const funnel = publishedBySlug(db, decodeURIComponent(checkout[1] ?? ''));
    const key = headerOf(headers, 'idempotency-key');
    if (!isIdempotencyKey(key)) throw fail(422, 'IDEMPOTENCY_KEY_REQUIRED', 'Falta el encabezado Idempotency-Key (de 8 a 64 caracteres)');
    if (!FUNNEL_TYPES[funnel.objective].charges) throw fail(422, 'FUNNEL_DOES_NOT_CHARGE', 'Este funnel no cobra');
    if (funnel.price === null || funnel.price <= 0) throw fail(422, 'PRICE_MISSING', 'Este funnel todavía no tiene precio');
    const connection = db.payments[funnel.workspaceId];
    if (!connection) throw fail(422, 'PAYMENTS_NOT_CONNECTED', 'El negocio no tiene Original Pay conectado');
    const issues = validateCheckout(data);
    if (issues.length > 0) throw invalid(issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
    const body = data as unknown as CheckoutBody;
    if (body.paymentMethod && !connection.methods.includes(body.paymentMethod)) throw invalid([{ path: 'paymentMethod', message: 'El negocio no acepta esa forma de pago' }]);

    const email = body.email.trim().toLowerCase();
    const method_ = body.paymentMethod ?? connection.methods[0] ?? null;
    const origin = typeof location === 'undefined' ? '' : location.origin;
    const respond = (order: DemoOrder) => ({ publicToken: order.publicToken, status: order.status, ...(order.status === 'pending' ? { paymentUrl: `${origin}/demo/pago/${order.publicToken}` } : {}) });

    // Un reintento con la misma clave devuelve la orden de siempre; con otros datos, 409.
    const repeated = db.orders.find((order) => order.funnelId === funnel.id && order.idempotencyKey === key);
    if (repeated) {
      if (repeated.customerEmail !== email || repeated.paymentMethod !== method_) throw fail(409, 'IDEMPOTENCY_KEY_REUSED', 'Esa clave ya se usó con otros datos');
      return done(respond(repeated));
    }

    const lead = leadFor(db, funnel, body);
    const own = db.orders.filter((order) => order.leadId === lead.id && order.funnelId === funnel.id);
    if (own.some((order) => order.status === 'paid')) throw fail(409, 'ORDER_ALREADY_PAID', 'Esta compra ya está pagada');
    const pending = own.find((order) => order.status === 'pending');
    if (pending) return done(respond(pending));

    const now = new Date().toISOString();
    const order: DemoOrder = {
      id: uuid(),
      publicToken: uuid(),
      funnelId: funnel.id,
      leadId: lead.id,
      orderNumber: `OF-${String(db.orders.length + 1).padStart(6, '0')}`,
      amount: funnel.price,
      currency: funnel.currency,
      status: 'pending',
      paymentMethod: method_,
      idempotencyKey: key,
      customerEmail: email,
      createdAt: now,
      paidAt: null,
    };
    db.orders.push(order);
    db.events.push({ id: uuid(), funnelId: funnel.id, type: 'checkout_started', properties: body.utm?.utm_source ? { source: String(body.utm.utm_source) } : {}, createdAt: now });
    save();
    return done(respond(order));
  }

  const orderRoute = /^\/public\/orders\/([^/]+)$/.exec(route);
  if (orderRoute && method === 'GET') {
    const { order, funnel } = orderOf(db, decodeURIComponent(orderRoute[1] ?? ''));
    return done(view(funnel, order));
  }

  // --- La «pasarela» de mentira (solo en desarrollo) ---
  const demoOrder = /^\/public\/_demo\/orders\/([^/]+)(\/pay)?$/.exec(route);
  if (demoOrder && method === 'GET' && !demoOrder[2]) {
    const { order, funnel } = orderOf(db, decodeURIComponent(demoOrder[1] ?? ''));
    return done({ slug: funnel.slug, name: funnel.name, amount: order.amount, currency: order.currency, status: order.status });
  }
  if (demoOrder && demoOrder[2] && method === 'POST') {
    const { order, funnel } = orderOf(db, decodeURIComponent(demoOrder[1] ?? ''));
    if (data.outcome !== 'paid' && data.outcome !== 'failed') throw invalid([{ path: 'outcome', message: 'Debe ser paid o failed' }]);
    // Una orden que ya no está pendiente no cambia.
    if (order.status === 'pending') {
      const now = new Date().toISOString();
      if (data.outcome === 'paid') {
        order.status = 'paid';
        order.paidAt = now;
        // Pagar mueve al lead a la etapa ganada.
        const lead = db.leads.find((item) => item.id === order.leadId);
        const won = stagesOf(db, funnel.workspaceId).find((stage) => stage.isWon);
        if (lead && won) lead.leadStageId = won.id;
        db.events.push({ id: uuid(), funnelId: funnel.id, type: 'payment_completed', properties: {}, createdAt: now });
      } else {
        order.status = 'failed';
      }
      save();
    }
    return done({ ...view(funnel, order), slug: funnel.slug });
  }

  return skip;
}

function orderOf(db: DemoDb, publicToken: string) {
  const order = db.orders.find((item) => item.publicToken === publicToken);
  const funnel = order && db.funnels.find((f) => f.id === order.funnelId);
  if (!order || !funnel) throw notFound('ORDER_NOT_FOUND', 'Orden no encontrada');
  return { order, funnel };
}
