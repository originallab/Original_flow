import { afterSubmitFor } from '@/shared/afterSubmit';
import { normalizeLead, validateLead, type LeadBody } from '@/shared/leads';
import { asObject, done, invalid, notFound, skip, uuid, type Answer, type DemoDb } from './demoCore';

/**
 * Los endpoints públicos de la demostración (ver demo.ts), sin sesión y con las reglas del backend
 * real: solo se ve lo publicado (todo lo demás responde el mismo 404), el lead exige consentimiento y
 * correo o teléfono, y los eventos del navegador se limitan a tres tipos y tres propiedades.
 */

interface Context {
  route: string;
  method: string;
  data: Record<string, unknown>;
  db: DemoDb;
  save: () => void;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_TYPES = ['page_view', 'section_view', 'button_click'];
const MAX_EVENTS = 20;
const PROPERTY_LIMITS: Record<string, number> = { source: 100, section: 100, blockKey: 50 };

const pageNotFound = () => notFound('PAGE_NOT_FOUND', 'Página no encontrada');

/** El funnel publicado con ese slug; un slug mal formado, inexistente o de un borrador responde lo mismo. */
function publishedBySlug(db: DemoDb, slug: string) {
  const funnel = SLUG.test(slug) ? db.funnels.find((f) => f.slug === slug && f.status === 'published') : undefined;
  if (!funnel) throw pageNotFound();
  return funnel;
}

export function demoPublicRoute({ route, method, data, db, save }: Context): Answer {
  const page = /^\/public\/pages\/([^/]+)$/.exec(route);
  if (page && method === 'GET') {
    const funnel = publishedBySlug(db, decodeURIComponent(page[1] ?? ''));
    return done({
      slug: funnel.slug,
      name: funnel.name,
      objective: funnel.objective,
      language: funnel.language,
      price: funnel.price,
      currency: funnel.currency,
      content: funnel.content,
      designSpec: funnel.designSpec,
      seo: funnel.seo,
      ctas: db.ctas.filter((c) => c.funnelId === funnel.id).map(({ blockKey, label, actionType, destination, trackingId }) => ({ blockKey, label, actionType, destination, trackingId })),
    });
  }

  const leads = /^\/public\/funnels\/([^/]+)\/leads$/.exec(route);
  if (leads && method === 'POST') {
    const funnel = publishedBySlug(db, decodeURIComponent(leads[1] ?? ''));
    const issues = validateLead(data);
    if (issues.length > 0) throw invalid(issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
    const lead = normalizeLead(data as unknown as LeadBody);
    db.leads.push({
      id: uuid(),
      funnelId: funnel.id,
      ...lead,
      // El visitante no decide a dónde va ni de dónde viene el lead; el servidor deja constancia del consentimiento.
      source: 'web_form',
      customFields: { ...lead.customFields, _consentAt: new Date().toISOString() },
      createdAt: new Date().toISOString(),
    });
    db.events.push({ id: uuid(), funnelId: funnel.id, type: 'lead_created', properties: lead.utm.utm_source ? { source: lead.utm.utm_source } : {}, createdAt: new Date().toISOString() });
    save();
    return done({ ok: true, next: afterSubmitFor(funnel.objective, funnel.typeConfig) });
  }

  const events = /^\/public\/funnels\/([^/]+)\/events$/.exec(route);
  if (events && method === 'POST') {
    const funnel = publishedBySlug(db, decodeURIComponent(events[1] ?? ''));
    const batch = Array.isArray(data.events) ? data.events : null;
    if (!batch || batch.length < 1 || batch.length > MAX_EVENTS) throw invalid([{ path: 'events', message: `Debe traer de 1 a ${MAX_EVENTS} eventos` }]);
    const problems: { path: string; message: string }[] = [];
    batch.forEach((event, index) => {
      const type = asObject(event).type;
      if (typeof type !== 'string' || !EVENT_TYPES.includes(type)) problems.push({ path: `events.${index}.type`, message: 'Tipo de evento no permitido' });
    });
    if (problems.length > 0) throw invalid(problems);
    const now = new Date().toISOString();
    for (const event of batch) {
      const { type, properties } = asObject(event);
      // Solo se conservan estas propiedades, como texto: nadie puede meter datos arbitrarios.
      const kept: Record<string, string> = {};
      for (const [key, limit] of Object.entries(PROPERTY_LIMITS)) {
        const value = asObject(properties)[key];
        if (typeof value === 'string' && value.trim() !== '') kept[key] = value.trim().slice(0, limit);
      }
      db.events.push({ id: uuid(), funnelId: funnel.id, type: String(type), properties: kept, createdAt: now });
    }
    save();
    return done({ accepted: batch.length });
  }

  return skip;
}
