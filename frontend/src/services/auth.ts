import { apiFetch } from './api';
import { isDemoMode } from './demo';

export interface MeResponse {
  user: { id: string; email: string; name: string | null };
  memberships: { id: string; role: string; clientId: string | null; workspaceId: string | null }[];
  workspaces: { id: string; name: string; clientId: string }[];
}

export type ValidateResponse = { validated: 0 } | { validated: 1; userId: string; email: string; profileComplete: boolean };

/** Quién dice Original Auth que es la persona (en el acceso simulado, lo que escribe en el formulario). */
export interface MockIdentity {
  email: string;
  name?: string;
}

/** ¿Está activo el acceso simulado a Original Auth? Solo en desarrollo: con el modo demostración o con `VITE_AUTH_MODE=mock_callback`. */
export const isMockAuth = () => import.meta.env.DEV && (isDemoMode() || import.meta.env.VITE_AUTH_MODE === 'mock_callback');

/** GET /auth/session: crea la sesión (todavía sin validar). */
export function createSession(): Promise<{ session: string }> {
  return apiFetch('/auth/session');
}

/**
 * Simula el aviso que Original Auth manda al backend cuando la persona se autentica. SOLO en
 * desarrollo: usa credenciales inventadas y nunca existe en una compilación de producción
 * (Vite elimina este código porque `import.meta.env.DEV` vale `false` allí).
 */
export function mockCallback(session: string, identity: MockIdentity): Promise<{ validated: 0 | 1 }> {
  // `import.meta.env.DEV` explícito: en producción esta función siempre lanza y Vite elimina el resto.
  if (!import.meta.env.DEV || !isMockAuth()) {
    throw new Error('El acceso simulado solo está disponible en desarrollo');
  }
  return apiFetch('/auth/callback', {
    method: 'POST',
    body: {
      token_app: import.meta.env.VITE_MOCK_TOKEN_APP,
      secret_key: import.meta.env.VITE_MOCK_SECRET_KEY,
      session,
      email: identity.email,
      ...(identity.name ? { name: identity.name } : {}),
    },
  });
}

/** POST /auth/validate: ¿ya quedó validada la sesión? */
export function validateSession(session: string): Promise<ValidateResponse> {
  return apiFetch('/auth/validate', { method: 'POST', body: { session } });
}

/** GET /me: la persona con sus membresías y workspaces. */
export function getMe(token: string): Promise<MeResponse> {
  return apiFetch('/me', { token });
}

/** DELETE /auth/session/:token: cierra la sesión en el servidor. */
export function logoutSession(token: string): Promise<void> {
  return apiFetch(`/auth/session/${encodeURIComponent(token)}`, { method: 'DELETE' });
}
