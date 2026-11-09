import { TEMPLATE_IDS, type DesignSpec } from '@/shared/blocks/types';
import { validateBlocks } from '@/shared/blocks/validate';
import { asObject, done, fail, invalid, notFound, ownFunnel, skip, uuid, type Answer, type DemoDb, type FunnelsContext } from './demoCore';
import { demoFunnelActionsRoute, syncCtas } from './demoFunnelActions';
import { OBJECTIVES, type Currency, type Funnel, type FunnelStatus } from './funnels';

/**
 * Los endpoints de funnels del modo demostración (ver demo.ts), con las reglas del backend real
 * (schemas/funnel.schemas.ts): crear en borrador, listar sin el contenido pesado, abrir completo,
 * guardar el contenido (validado bloque por bloque) y el diseño.
 */

const HEX = /^#[0-9A-Fa-f]{6}$/;
const FONT = /^[A-Za-z0-9 ]{1,60}$/;
const CURRENCIES: Currency[] = ['MXN', 'USD', 'CLP'];
const UNAVAILABLE = new Set(['upsell', 'libre']);
const LIST_FIELDS = ['id', 'workspaceId', 'name', 'objective', 'status', 'language', 'slug', 'productName', 'price', 'currency', 'targetAudience', 'createdAt', 'updatedAt'] as const;

/** Sin acentos, en minúsculas y con guiones (como `slugify` del backend). */
function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return base.length >= 3 ? base : 'funnel';
}

function freeSlug(db: DemoDb, name: string): string {
  const base = slugify(name);
  if (!db.funnels.some((f) => f.slug === base)) return base;
  return `${base}-${uuid().slice(0, 4)}`;
}

function text(errors: { path: string; message: string }[], data: Record<string, unknown>, key: string, max: number, required = false) {
  const value = data[key];
  if (value === undefined) {
    if (required) errors.push({ path: key, message: 'Requerido' });
    return;
  }
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > max) errors.push({ path: key, message: `Debe tener entre 1 y ${max} caracteres` });
}

function validateNewFunnel(data: Record<string, unknown>) {
  const errors: { path: string; message: string }[] = [];
  if (typeof data.workspaceId !== 'string') errors.push({ path: 'workspaceId', message: 'Requerido' });
  text(errors, data, 'name', 120, true);
  if (!OBJECTIVES.includes(data.objective as never)) errors.push({ path: 'objective', message: 'Tipo de funnel no válido' });
  text(errors, data, 'productName', 200);
  text(errors, data, 'targetAudience', 300);
  if (data.price !== undefined && (typeof data.price !== 'number' || data.price < 0 || data.price > 9_999_999_999)) errors.push({ path: 'price', message: 'Debe ser un número mayor o igual a 0' });
  if (data.currency !== undefined && !CURRENCIES.includes(data.currency as Currency)) errors.push({ path: 'currency', message: 'Divisa no válida' });
  if (data.language !== undefined && !(typeof data.language === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(data.language))) errors.push({ path: 'language', message: 'Debe ser un código de idioma como es o es-MX' });
  return errors;
}

function validateDesign(data: Record<string, unknown>) {
  const errors: { path: string; message: string }[] = [];
  if (!TEMPLATE_IDS.includes(data.template as never)) errors.push({ path: 'template', message: 'Plantilla no válida' });
  if (data.palette !== undefined) {
    for (const key of ['primary', 'secondary', 'accent', 'background', 'text']) {
      const value = asObject(data.palette)[key];
      if (typeof value !== 'string' || !HEX.test(value)) errors.push({ path: `palette.${key}`, message: 'debe ser un color hexadecimal como #0E7A63' });
    }
  }
  if (data.fonts !== undefined) {
    for (const key of ['heading', 'body']) {
      const value = asObject(data.fonts)[key];
      if (typeof value !== 'string' || !FONT.test(value.trim())) errors.push({ path: `fonts.${key}`, message: 'solo letras, números y espacios' });
    }
  }
  return errors;
}

export function demoFunnelsRoute(ctx: FunnelsContext): Answer {
  const { route, query, method, data, db, sessionOf, save } = ctx;
  const own = (id: string): Funnel => ownFunnel(ctx, id);
  const ownWorkspace = (id: unknown) => {
    const session = sessionOf();
    const workspace = db.workspaces.find((w) => w.id === id && w.ownerEmail === session.email);
    if (!workspace) throw notFound('WORKSPACE_NOT_FOUND', 'Workspace no encontrado');
    return workspace;
  };

  if (route === '/funnels' && method === 'GET') {
    ownWorkspace(query.get('workspaceId'));
    const status = query.get('status');
    const items = db.funnels
      .filter((f) => f.workspaceId === query.get('workspaceId') && (!status || f.status === (status as FunnelStatus)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((f) => Object.fromEntries(LIST_FIELDS.map((key) => [key, f[key]])));
    return done({ items, total: items.length, page: 1, pageSize: 100 });
  }

  if (route === '/funnels' && method === 'POST') {
    sessionOf();
    const errors = validateNewFunnel(data);
    if (errors.length > 0) throw invalid(errors);
    ownWorkspace(data.workspaceId);
    if (UNAVAILABLE.has(String(data.objective))) throw fail(422, 'FUNNEL_TYPE_UNAVAILABLE', 'Ese tipo de funnel todavía no está disponible');
    const now = new Date().toISOString();
    const trimmed = (key: string) => (typeof data[key] === 'string' ? (data[key] as string).trim() : null);
    const funnel: Funnel = {
      id: uuid(),
      workspaceId: String(data.workspaceId),
      name: trimmed('name') ?? '',
      objective: data.objective as Funnel['objective'],
      status: 'draft',
      language: typeof data.language === 'string' ? data.language : 'es',
      slug: freeSlug(db, trimmed('name') ?? ''),
      productName: trimmed('productName'),
      price: typeof data.price === 'number' ? data.price : null,
      currency: (data.currency as Currency | undefined) ?? 'MXN',
      targetAudience: trimmed('targetAudience'),
      createdAt: now,
      updatedAt: now,
      typeConfig: null,
      brandBrief: null,
      designSpec: null,
      content: { blocks: [] },
      seo: null,
      flow: null,
    };
    db.funnels.push(funnel);
    save();
    return done(funnel);
  }

  const one = /^\/funnels\/([^/]+)$/.exec(route);
  if (one && method === 'GET') return done(own(decodeURIComponent(one[1] ?? '')));

  const content = /^\/funnels\/([^/]+)\/content$/.exec(route);
  if (content && method === 'PUT') {
    const funnel = own(decodeURIComponent(content[1] ?? ''));
    const issues = validateBlocks(data.blocks);
    if (issues.length > 0) throw invalid(issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
    funnel.content = { blocks: (data.blocks as Funnel['content']['blocks']).map((block) => ({ ...block, style: block.style ?? {} })) };
    funnel.updatedAt = new Date().toISOString();
    syncCtas(ctx, funnel);
    save();
    return done({ blocks: funnel.content.blocks, updatedAt: funnel.updatedAt });
  }

  const design = /^\/funnels\/([^/]+)\/design-spec$/.exec(route);
  if (design && method === 'PUT') {
    const funnel = own(decodeURIComponent(design[1] ?? ''));
    const errors = validateDesign(data);
    if (errors.length > 0) throw invalid(errors);
    funnel.designSpec = data as unknown as DesignSpec;
    funnel.updatedAt = new Date().toISOString();
    save();
    return done({ designSpec: funnel.designSpec });
  }

  // Editar el funnel, sus ajustes y CTA, publicar y despublicar.
  return demoFunnelActionsRoute(ctx);
}
