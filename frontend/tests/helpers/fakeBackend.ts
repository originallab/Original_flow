import { vi } from 'vitest';
import type { Workspace } from '@/services/workspaces';

export const MOCK_ENV = { token: 'token-app-de-prueba', secret: 'secreto-de-prueba' };

export interface FakeCall {
  method: string;
  path: string;
  authorization: string | null;
  body: Record<string, unknown> | null;
}

/** Aplica las variables de entorno del acceso simulado. */
export function stubMockEnv() {
  vi.stubEnv('VITE_AUTH_MODE', 'mock_callback');
  vi.stubEnv('VITE_MOCK_TOKEN_APP', MOCK_ENV.token);
  vi.stubEnv('VITE_MOCK_SECRET_KEY', MOCK_ENV.secret);
}

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** El negocio con el mismo formato (el tipo real del front) que devuelve el backend. */
export type FakeWorkspace = Workspace;

let workspaceCounter = 0;
/** Un negocio con el mismo formato que devuelve el backend. */
export function workspaceFixture(overrides: Partial<FakeWorkspace> = {}): FakeWorkspace {
  workspaceCounter += 1;
  return {
    id: `w${workspaceCounter}`,
    clientId: 'c1',
    name: 'Academia Nimbral',
    country: 'México',
    website: null,
    industry: 'educacion',
    logoFileId: null,
    brandPalette: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    role: 'client_admin',
    ...overrides,
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Las mismas reglas de validación que el backend para el alta (`creating`) y la edición de un negocio. */
function validateWorkspaceBody(body: Record<string, unknown> | null, creating: boolean) {
  const errors: { path: string; message: string }[] = [];
  const name = body?.name;
  if ((creating || name !== undefined) && (typeof name !== 'string' || name.trim() === '')) errors.push({ path: 'name', message: 'Requerido' });
  const website = body?.website;
  if (typeof website === 'string' && !/^https?:\/\//.test(website)) errors.push({ path: 'website', message: 'Debe ser una URL válida (https://…)' });
  const palette = body?.brandPalette as Record<string, string> | null | undefined;
  if (palette) for (const [key, value] of Object.entries(palette)) if (!HEX.test(value)) errors.push({ path: `brandPalette.${key}`, message: 'Color inválido' });
  return errors;
}
const validation = (details: { path: string; message: string }[]) =>
  json(422, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', details }, requestId: 'req_x' });


/**
 * Backend de mentira con los endpoints de autenticación y /me, con el mismo contrato que el real
 * (backend/docs API_MVP). Registra cada llamada para poder comprobarla.
 */
export function createFakeBackend() {
  const calls: FakeCall[] = [];
  const sessions = new Map<string, { validated: boolean; email?: string; name?: string }>();
  // Por defecto la persona ya tiene un negocio; las pruebas del alta lo vacían con `state.workspaces = []`.
  const state = { down: false, downPaths: [] as string[], secretOk: true, workspaces: [workspaceFixture()] as FakeWorkspace[] };
  let counter = 0;

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input).replace('/api/v1', '').split('?')[0]!;
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method, path, authorization: headers.get('Authorization'), body });

    // `down`: ningún endpoint responde. `downPaths`: solo dejan de responder esas rutas.
    if (state.down || state.downPaths.includes(path)) throw new TypeError('Failed to fetch');

    if (path === '/auth/session' && method === 'GET') {
      counter += 1;
      const session = `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
      sessions.set(session, { validated: false });
      return json(200, { session });
    }

    if (path === '/auth/callback' && method === 'POST') {
      const session = sessions.get(String(body?.session));
      const ok = state.secretOk && body?.token_app === MOCK_ENV.token && body?.secret_key === MOCK_ENV.secret;
      if (!session || !ok) return json(200, { validated: 0 });
      Object.assign(session, { validated: true, email: String(body?.email), name: body?.name ? String(body.name) : undefined });
      return json(200, { validated: 1 });
    }

    if (path === '/auth/validate' && method === 'POST') {
      const session = sessions.get(String(body?.session));
      if (!session?.validated) return json(200, { validated: 0 });
      return json(200, { validated: 1, userId: 'u1', email: session.email, profileComplete: false });
    }

    if (path === '/me' && method === 'GET') {
      const token = headers.get('Authorization')?.replace('Bearer ', '') ?? '';
      const session = sessions.get(token);
      if (!session?.validated) return json(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida o inválida', details: {} }, requestId: 'req_x' });
      return json(200, {
        user: { id: 'u1', email: session.email, name: session.name ?? null },
        memberships: [],
        workspaces: state.workspaces.map(({ id, name, clientId }) => ({ id, name, clientId })),
      });
    }

    const authed = () => sessions.get(headers.get('Authorization')?.replace('Bearer ', '') ?? '')?.validated === true;
    const noAuth = () => json(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida o inválida', details: {} }, requestId: 'req_x' });

    if (path === '/workspaces' && method === 'GET') {
      if (!authed()) return noAuth();
      return json(200, { items: state.workspaces, total: state.workspaces.length, page: 1, pageSize: 100 });
    }

    if (path === '/workspaces' && method === 'POST') {
      if (!authed()) return noAuth();
      const errors = validateWorkspaceBody(body, true);
      if (errors.length > 0) return validation(errors);
      const created = workspaceFixture({
        name: String(body?.name),
        country: (body?.country as string | undefined) ?? null,
        website: (body?.website as string | undefined) ?? null,
        industry: (body?.industry as string | undefined) ?? null,
        role: 'client_admin',
      });
      state.workspaces.push(created);
      return json(201, created);
    }

    const one = /^\/workspaces\/([^/]+)$/.exec(path);
    if (one && method === 'PATCH') {
      if (!authed()) return noAuth();
      const workspace = state.workspaces.find((w) => w.id === decodeURIComponent(one[1]!));
      if (!workspace) return json(404, { success: false, error: { code: 'NOT_FOUND', message: 'Recurso no encontrado', details: {} }, requestId: 'req_x' });
      if (workspace.role !== 'client_admin' && workspace.role !== 'super_admin') {
        return json(403, { success: false, error: { code: 'FORBIDDEN', message: 'No tienes permiso', details: {} }, requestId: 'req_x' });
      }
      const errors = validateWorkspaceBody(body, false);
      if (errors.length > 0) return validation(errors);
      Object.assign(workspace, body);
      return json(200, workspace);
    }

    if (path.startsWith('/auth/session/') && method === 'DELETE') {
      sessions.delete(decodeURIComponent(path.replace('/auth/session/', '')));
      return json(204);
    }

    return json(404, { success: false, error: { code: 'NOT_FOUND', message: 'Recurso no encontrado', details: {} }, requestId: 'req_x' });
  });

  return {
    calls,
    state,
    sessions,
    spy,
    /** Una sesión ya validada, como si la persona hubiera iniciado sesión antes. */
    seedSession(email = 'ana@correo.com', name?: string) {
      counter += 1;
      const token = `11111111-1111-4111-8111-${String(counter).padStart(12, '0')}`;
      sessions.set(token, { validated: true, email, name });
      return token;
    },
    callsTo: (path: string) => calls.filter((c) => c.path === path),
  };
}

export type FakeBackend = ReturnType<typeof createFakeBackend>;
