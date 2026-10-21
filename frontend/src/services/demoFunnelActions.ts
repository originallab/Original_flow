import { pruneToFields } from '@/shared/blocks/validate';
import { FUNNEL_TYPES, validateTypeConfig } from '@/shared/funnelTypes';
import { findPublishProblems } from '@/shared/publish';
import { done, fail, invalid, notFound, ownFunnel, recordVersion, skip, uuid, type Answer, type FunnelsContext } from './demoCore';
import type { Cta, CtaActionType, Currency, Funnel } from './funnels';

/**
 * Más endpoints de funnels de la demostración (ver demoFunnels.ts): editar sus datos, los ajustes de su
 * tipo, los CTA, y publicar o despublicar. Con las mismas reglas y errores que el backend real.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CURRENCIES: Currency[] = ['MXN', 'USD', 'CLP'];
const ACTIONS: CtaActionType[] = ['url', 'form_submit', 'scroll_to', 'checkout'];
const ALLOWED_BY_BLOCK: Record<string, CtaActionType[]> = { boton: ['url', 'scroll_to', 'checkout'], formulario: ['form_submit'] };

type Errors = { path: string; message: string }[];

function textRule(errors: Errors, data: Record<string, unknown>, key: string, max: number, nullable: boolean) {
  const value = data[key];
  if (value === undefined || (value === null && nullable)) return;
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > max) errors.push({ path: key, message: `Debe tener entre 1 y ${max} caracteres` });
}

function validateChanges(data: Record<string, unknown>): Errors {
  const errors: Errors = [];
  if (Object.keys(data).length === 0) errors.push({ path: '', message: 'debe enviar al menos un campo' });
  textRule(errors, data, 'name', 120, false);
  textRule(errors, data, 'productName', 200, true);
  textRule(errors, data, 'targetAudience', 300, true);
  if (data.price !== undefined && data.price !== null && (typeof data.price !== 'number' || data.price < 0 || data.price > 9_999_999_999)) errors.push({ path: 'price', message: 'Debe ser un número mayor o igual a 0' });
  if (data.currency !== undefined && !CURRENCIES.includes(data.currency as Currency)) errors.push({ path: 'currency', message: 'Divisa no válida' });
  if (data.slug !== undefined && !(typeof data.slug === 'string' && data.slug.trim().length >= 3 && data.slug.trim().length <= 60 && SLUG.test(data.slug.trim()))) {
    errors.push({ path: 'slug', message: 'debe usar minúsculas, números y guiones, por ejemplo mi-curso-de-datos' });
  }
  if (data.language !== undefined && !(typeof data.language === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(data.language))) errors.push({ path: 'language', message: 'Debe ser un código de idioma como es o es-MX' });
  return errors;
}

/** Un CTA por cada botón y formulario de la página (como hace el backend al guardar el contenido). */
export function syncCtas({ db }: Pick<FunnelsContext, 'db'>, funnel: Funnel) {
  const charges = FUNNEL_TYPES[funnel.objective].charges;
  const desired = funnel.content.blocks
    .filter((block) => block.type === 'boton' || block.type === 'formulario')
    .map((block) => ({
      block,
      label: String(block.type === 'formulario' ? block.content.submitLabel : block.content.label),
      action: (block.type === 'formulario' ? 'form_submit' : charges ? 'checkout' : 'scroll_to') as CtaActionType,
    }));
  const keys = new Set(desired.map((d) => d.block.key));
  db.ctas = db.ctas.filter((cta) => cta.funnelId !== funnel.id || keys.has(cta.blockKey));
  for (const { block, label, action } of desired) {
    const existing = db.ctas.find((cta) => cta.funnelId === funnel.id && cta.blockKey === block.key);
    if (!existing) {
      db.ctas.push({ id: uuid(), funnelId: funnel.id, blockKey: block.key, label, actionType: action, destination: null, trackingId: null });
    } else {
      existing.label = label;
      // Si el bloque cambió de botón a formulario (o al revés), su CTA se reinicia.
      if (!ALLOWED_BY_BLOCK[block.type]!.includes(existing.actionType)) Object.assign(existing, { actionType: action, destination: null });
    }
  }
}

export function demoFunnelActionsRoute(ctx: FunnelsContext): Answer {
  const { route, method, data, db, save } = ctx;
  const idOf = (match: RegExpExecArray) => decodeURIComponent(match[1] ?? '');

  const one = /^\/funnels\/([^/]+)$/.exec(route);
  if (one && method === 'PATCH') {
    const funnel = ownFunnel(ctx, idOf(one));
    const errors = validateChanges(data);
    if (errors.length > 0) throw invalid(errors);
    if (typeof data.slug === 'string' && db.funnels.some((f) => f.id !== funnel.id && f.slug === (data.slug as string).trim())) throw fail(409, 'SLUG_TAKEN', 'Ese slug ya lo usa otro funnel');
    for (const key of ['name', 'productName', 'targetAudience', 'slug'] as const) {
      if (data[key] !== undefined) funnel[key] = (typeof data[key] === 'string' ? (data[key] as string).trim() : null) as never;
    }
    if (data.price !== undefined) funnel.price = data.price as number | null;
    if (data.currency !== undefined) funnel.currency = data.currency as Currency;
    if (data.language !== undefined) funnel.language = data.language as string;
    funnel.updatedAt = new Date().toISOString();
    save();
    return done(funnel);
  }

  const typeConfig = /^\/funnels\/([^/]+)\/type-config$/.exec(route);
  if (typeConfig && method === 'PUT') {
    const funnel = ownFunnel(ctx, idOf(typeConfig));
    const def = FUNNEL_TYPES[funnel.objective];
    if (!def.available) throw fail(422, 'FUNNEL_TYPE_UNAVAILABLE', 'Ese tipo de funnel todavía no está disponible');
    const issues = validateTypeConfig(funnel.objective, data);
    if (issues.length > 0) throw invalid(issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
    funnel.typeConfig = pruneToFields(def.fields, data);
    funnel.updatedAt = new Date().toISOString();
    save();
    return done({ typeConfig: funnel.typeConfig });
  }

  const ctas = /^\/funnels\/([^/]+)\/ctas$/.exec(route);
  if (ctas && method === 'GET') {
    const funnel = ownFunnel(ctx, idOf(ctas));
    return done(db.ctas.filter((cta) => cta.funnelId === funnel.id));
  }

  const cta = /^\/funnels\/([^/]+)\/ctas\/([^/]+)$/.exec(route);
  if (cta && method === 'PATCH') {
    const funnel = ownFunnel(ctx, idOf(cta));
    const current: Cta | undefined = db.ctas.find((c) => c.funnelId === funnel.id && c.blockKey === decodeURIComponent(cta[2] ?? ''));
    const errors: Errors = [];
    if (Object.keys(data).length === 0) errors.push({ path: '', message: 'debe enviar al menos un campo' });
    if (data.actionType !== undefined && !ACTIONS.includes(data.actionType as CtaActionType)) errors.push({ path: 'actionType', message: 'Acción no válida' });
    textRule(errors, data, 'destination', 500, true);
    textRule(errors, data, 'trackingId', 100, true);
    if (errors.length > 0) throw invalid(errors);
    if (!current) throw notFound('CTA_NOT_FOUND', 'CTA no encontrado');

    const blockType = funnel.content.blocks.find((block) => block.key === current.blockKey)?.type;
    const actionType = (data.actionType as CtaActionType | undefined) ?? current.actionType;
    const allowed = blockType ? ALLOWED_BY_BLOCK[blockType] : undefined;
    if (allowed && !allowed.includes(actionType)) throw fail(422, 'CTA_ACTION_NOT_ALLOWED', `Un ${blockType} no puede tener la acción ${actionType}`);
    if (actionType === 'checkout' && !FUNNEL_TYPES[funnel.objective].charges) throw fail(422, 'CTA_CHECKOUT_NOT_ALLOWED', 'Este tipo de funnel no cobra, no puede tener un botón de pago');

    const destination =
      data.destination !== undefined ? (data.destination as string | null) : data.actionType && data.actionType !== current.actionType ? null : current.destination;
    if (actionType === 'url' && destination && !/^https?:\/\/\S+$/i.test(destination)) throw fail(422, 'CTA_DESTINATION_INVALID', 'El destino de un enlace debe ser una URL http o https');

    current.actionType = actionType;
    current.destination = destination === null ? null : destination.trim();
    if (data.trackingId !== undefined) current.trackingId = data.trackingId === null ? null : String(data.trackingId).trim();
    save();
    return done(current);
  }

  const publish = /^\/funnels\/([^/]+)\/(publish|unpublish)$/.exec(route);
  if (publish && method === 'POST') {
    const funnel = ownFunnel(ctx, idOf(publish));
    if (publish[2] === 'unpublish') {
      funnel.status = 'draft';
    } else if (funnel.status !== 'published') {
      // Original Pay todavía no existe: un funnel que cobra nunca está listo (igual que en el backend real hoy).
      const problems = findPublishProblems({
        objective: funnel.objective,
        price: funnel.price,
        typeConfig: funnel.typeConfig,
        blocks: funnel.content.blocks,
        ctas: db.ctas.filter((c) => c.funnelId === funnel.id),
        hasPayments: false,
      });
      if (problems.length > 0) throw fail(422, 'FUNNEL_NOT_READY', 'El funnel todavía no se puede publicar', { missing: problems });
      funnel.status = 'published';
      // Como el backend real: publicar guarda una versión.
      recordVersion(db, funnel, ctx.sessionOf().email, 'Publicado');
    }
    save();
    return done(funnel);
  }

  return skip;
}
