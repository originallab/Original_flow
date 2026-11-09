import { asObject, fail, invalid, notFound, unauthorized, uuid, type DemoDb, type DemoWorkspace } from './demoCore';
import { demoAnalyticsRoute } from './demoAnalytics';
import { demoFunnelsRoute } from './demoFunnels';
import { demoHistoryRoute } from './demoHistory';
import { demoLeadsRoute } from './demoLeads';
import { demoMembersRoute } from './demoMembers';
import { demoStagesRoute } from './demoStages';
import { demoPaymentsRoute } from './demoPayments';
import { demoPublicRoute } from './demoPublic';
import type { Workspace } from './workspaces';

/**
 * MODO DEMOSTRACIÓN: un «backend de mentira» que corre dentro del navegador para poder navegar por
 * las pantallas sin servidor ni base de datos. Responde los mismos endpoints, con los mismos
 * formatos y errores, que el backend real (docs/API_MVP.md), pero NO valida nada de verdad.
 *
 * - Solo existe en desarrollo y solo si `VITE_DEMO_MODE=true`: en una compilación de producción
 *   Vite elimina este código (`import.meta.env.DEV` vale `false` allí).
 * - Los datos se guardan en este navegador (`localStorage`, clave `of-demo-db`); no van a ningún lado.
 */
export const isDemoMode = () => import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true';

const STORAGE_KEY = 'of-demo-db';

interface DemoRequest {
  method: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
}

const emptyDb = (): DemoDb => ({ sessions: {}, workspaces: [], funnels: [], ctas: [], history: [], orders: [], payments: {}, leadStages: [], members: [], leads: [], events: [] });

// Copia en memoria por si el navegador no deja usar localStorage (por ejemplo, en una ventana privada).
let memory: DemoDb | null = null;

function read(): DemoDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...emptyDb(), ...(JSON.parse(raw) as Partial<DemoDb>) } : emptyDb();
  } catch {
    return memory ?? emptyDb();
  }
}

function write(db: DemoDb) {
  memory = db;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Sin almacenamiento: los datos duran lo que dure esta carga de la página.
  }
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Las mismas reglas del backend (schemas/workspace.schemas.ts) para el alta (`creating`) y la edición de un negocio. */
function validateWorkspace(body: Record<string, unknown>, creating: boolean) {
  const errors: { path: string; message: string }[] = [];
  const text = (key: string, max: number, nullable: boolean) => {
    const value = body[key];
    if (value === undefined) {
      if (creating && key === 'name') errors.push({ path: key, message: 'Requerido' });
      return;
    }
    if (value === null && nullable) return;
    if (typeof value !== 'string' || value.trim() === '' || value.trim().length > max) {
      errors.push({ path: key, message: `Debe tener entre 1 y ${max} caracteres` });
    }
  };
  text('name', 120, false);
  text('country', 80, !creating);
  text('website', 200, !creating);
  text('industry', 80, !creating);
  const palette = body.brandPalette;
  if (palette !== undefined && palette !== null) {
    for (const key of ['primary', 'secondary', 'accent', 'background', 'text']) {
      const value = asObject(palette)[key];
      if (typeof value !== 'string' || !HEX.test(value)) errors.push({ path: `brandPalette.${key}`, message: 'debe ser un color hexadecimal como #0E7A63' });
    }
  }
  if (!creating && Object.keys(body).length === 0) errors.push({ path: '', message: 'debe enviar al menos un campo' });
  return errors;
}

const publicWorkspace = ({ ownerEmail: _owner, ...workspace }: DemoWorkspace): Workspace => workspace;

/** Responde una petición como lo haría el backend. Lanza `ApiError` con el mismo formato que el real. */
export async function demoRequest<T>(path: string, { method, body, token, headers = {} }: DemoRequest): Promise<T> {
  const [route = path, queryText = ''] = path.split('?');
  const query = new URLSearchParams(queryText);
  const db = read();
  const data = asObject(body);

  const sessionOf = () => {
    const session = token ? db.sessions[token] : undefined;
    if (!session?.validated) throw unauthorized();
    return session;
  };
  const respond = (value: unknown) => value as T;

  // Endpoints públicos: los usa el visitante de una página publicada, sin sesión.
  if (route.startsWith('/public/')) {
    const publicAnswer = demoPublicRoute({ route, method, data, headers, db, save: () => write(db) });
    if (publicAnswer.handled) return respond(publicAnswer.value);
    throw notFound();
  }

  if (route === '/auth/session' && method === 'GET') {
    const session = uuid();
    db.sessions[session] = { email: '', name: null, validated: false };
    write(db);
    return respond({ session });
  }

  if (route === '/auth/callback' && method === 'POST') {
    const session = db.sessions[String(data.session)];
    if (!session) return respond({ validated: 0 });
    Object.assign(session, { email: String(data.email ?? ''), name: data.name ? String(data.name) : null, validated: true });
    write(db);
    return respond({ validated: 1 });
  }

  if (route === '/auth/validate' && method === 'POST') {
    const session = db.sessions[String(data.session)];
    if (!session?.validated) return respond({ validated: 0 });
    return respond({ validated: 1, userId: `demo-${session.email}`, email: session.email, profileComplete: false });
  }

  if (route === '/me' && method === 'GET') {
    const session = sessionOf();
    const own = db.workspaces.filter((w) => w.ownerEmail === session.email);
    return respond({
      user: { id: `demo-${session.email}`, email: session.email, name: session.name },
      memberships: own.map((w) => ({ id: `m-${w.id}`, role: 'client_admin', clientId: w.clientId, workspaceId: w.id })),
      workspaces: own.map(({ id, name, clientId }) => ({ id, name, clientId })),
    });
  }

  if (route.startsWith('/auth/session/') && method === 'DELETE') {
    delete db.sessions[decodeURIComponent(route.slice('/auth/session/'.length))];
    write(db);
    return respond(undefined);
  }

  if (route === '/workspaces' && method === 'GET') {
    const session = sessionOf();
    const items = db.workspaces.filter((w) => w.ownerEmail === session.email).map(publicWorkspace);
    return respond({ items, total: items.length, page: 1, pageSize: 100 });
  }

  if (route === '/workspaces' && method === 'POST') {
    const session = sessionOf();
    const errors = validateWorkspace(data, true);
    if (errors.length > 0) throw invalid(errors);
    const trimmed = (key: string) => (typeof data[key] === 'string' ? (data[key] as string).trim() : null);
    const existing = db.workspaces.find((w) => w.ownerEmail === session.email);
    const workspace: DemoWorkspace = {
      id: uuid(),
      clientId: existing?.clientId ?? uuid(),
      name: trimmed('name') ?? '',
      country: trimmed('country'),
      website: trimmed('website'),
      industry: trimmed('industry'),
      logoFileId: null,
      brandPalette: null,
      createdAt: new Date().toISOString(),
      role: 'client_admin',
      ownerEmail: session.email,
    };
    db.workspaces.push(workspace);
    write(db);
    return respond(publicWorkspace(workspace));
  }

  const one = /^\/workspaces\/([^/]+)$/.exec(route);
  if (one && method === 'PATCH') {
    const session = sessionOf();
    const workspace = db.workspaces.find((w) => w.id === decodeURIComponent(one[1] ?? '') && w.ownerEmail === session.email);
    if (!workspace) throw notFound();
    const errors = validateWorkspace(data, false);
    if (errors.length > 0) throw invalid(errors);
    for (const key of ['name', 'country', 'website', 'industry', 'logoFileId'] as const) {
      const value = data[key];
      if (value !== undefined) workspace[key] = typeof value === 'string' ? value.trim() : (null as never);
    }
    if (data.brandPalette !== undefined) workspace.brandPalette = data.brandPalette as Workspace['brandPalette'];
    write(db);
    return respond(publicWorkspace(workspace));
  }

  // Funnels (crear, listar, abrir, guardar contenido y diseño).
  const funnelsAnswer = demoFunnelsRoute({ route, query, method, data, db, sessionOf, save: () => write(db) });
  if (funnelsAnswer.handled) return respond(funnelsAnswer.value);

  // Historial de versiones de un funnel.
  const historyAnswer = demoHistoryRoute({ route, query, method, data, db, sessionOf, save: () => write(db) });
  if (historyAnswer.handled) return respond(historyAnswer.value);

  // Leads y las etapas de su tablero.
  const leadsAnswer = demoLeadsRoute({ route, query, method, data, db, sessionOf, save: () => write(db) });
  if (leadsAnswer.handled) return respond(leadsAnswer.value);

  // Agregar, renombrar, mover y quitar etapas del tablero.
  const stagesAnswer = demoStagesRoute({ route, query, method, data, db, sessionOf, save: () => write(db) });
  if (stagesAnswer.handled) return respond(stagesAnswer.value);

  // Analítica del dashboard.
  const analyticsAnswer = demoAnalyticsRoute({ route, query, method, data, db, sessionOf, save: () => write(db) });
  if (analyticsAnswer.handled) return respond(analyticsAnswer.value);

  // Conexión con Original Pay.
  const paymentsAnswer = demoPaymentsRoute({ route, query, method, data, db, sessionOf, save: () => write(db) });
  if (paymentsAnswer.handled) return respond(paymentsAnswer.value);

  // Equipo e invitaciones.
  const membersAnswer = demoMembersRoute({ route, query, method, data, db, sessionOf, save: () => write(db) });
  if (membersAnswer.handled) return respond(membersAnswer.value);

  throw notFound();
}
