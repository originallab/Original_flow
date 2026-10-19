import { vi } from 'vitest';

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

/**
 * Backend de mentira con los endpoints de autenticación y /me, con el mismo contrato que el real
 * (backend/docs API_MVP). Registra cada llamada para poder comprobarla.
 */
export function createFakeBackend() {
  const calls: FakeCall[] = [];
  const sessions = new Map<string, { validated: boolean; email?: string; name?: string }>();
  const state = { down: false, secretOk: true, workspaces: [] as { id: string; name: string; clientId: string }[] };
  let counter = 0;

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input).replace('/api/v1', '');
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method, path, authorization: headers.get('Authorization'), body });

    if (state.down) throw new TypeError('Failed to fetch');

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
        workspaces: state.workspaces,
      });
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
