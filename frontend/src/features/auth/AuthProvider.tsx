import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '@/services/api';
import { createSession, getMe, logoutSession, mockCallback, validateSession, type MeResponse, type MockIdentity } from '@/services/auth';
import { buildLoginUrl, waitForValidation } from '@/services/originalAuth';
import { navigation } from '@/shared/utils/navigation';
import { sessionStore } from './sessionStore';

/**
 * - loading: comprobando si hay una sesión guardada.
 * - anonymous: no hay sesión (hay que iniciar sesión).
 * - authenticated: hay sesión válida y `me` está cargado.
 * - unavailable: no se pudo hablar con el servidor; la sesión guardada NO se borra, se puede reintentar.
 */
export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'unavailable';

interface AuthContextValue {
  status: AuthStatus;
  me: MeResponse | null;
  /** Token de la sesión actual, para las llamadas a la API. */
  token: string | null;
  login: (identity: MockIdentity) => Promise<void>;
  /** Acceso real: crea la sesión y manda a la persona a Original Auth (el navegador sale de la aplicación). `from` es a dónde volver al terminar. */
  beginRealLogin: (from: string) => Promise<void>;
  /** Acceso real, al regresar de Original Auth (`/auth/return`): espera la validación y deja la sesión iniciada. Devuelve a dónde ir. */
  completeRealLogin: () => Promise<string>;
  logout: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * El login no se completó. `code` dice por qué en el acceso real: `no_pending` (no hay un inicio de sesión en curso
 * en este navegador) o `not_validated` (Original Auth no validó la sesión a tiempo).
 */
export class LoginError extends Error {
  constructor(
    message: string,
    readonly code: 'failed' | 'no_pending' | 'not_validated' = 'failed',
  ) {
    super(message);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Al abrir la aplicación: si hay un token guardado, se comprueba con /me.
  useEffect(() => {
    const saved = sessionStore.get();
    if (!saved) {
      setStatus('anonymous');
      return;
    }
    setStatus('loading');
    getMe(saved)
      .then((profile) => {
        if (!alive.current) return;
        setToken(saved);
        setMe(profile);
        setStatus('authenticated');
      })
      .catch((err: unknown) => {
        if (!alive.current) return;
        if (err instanceof ApiError && err.status === 401) {
          // La sesión venció o se cerró: se descarta.
          sessionStore.clear();
          setStatus('anonymous');
        } else {
          setStatus('unavailable');
        }
      });
  }, [attempt]);

  const login = useCallback(async (identity: MockIdentity) => {
    const { session } = await createSession();
    await mockCallback(session, identity);
    const validation = await validateSession(session);
    if (validation.validated !== 1) throw new LoginError('No se pudo validar tu sesión con Original Auth. Revisa las credenciales de desarrollo.');
    const profile = await getMe(session);
    sessionStore.set(session);
    setToken(session);
    setMe(profile);
    setStatus('authenticated');
  }, []);

  const beginRealLogin = useCallback(async (from: string) => {
    const { session } = await createSession();
    sessionStore.setPending({ session, from });
    navigation.to(buildLoginUrl(session));
  }, []);

  const completeRealLogin = useCallback(async () => {
    const pending = sessionStore.getPending();
    if (!pending) throw new LoginError('No encontramos un inicio de sesión en curso en este navegador.', 'no_pending');
    const validation = await waitForValidation(pending.session);
    if (!validation) {
      sessionStore.clearPending();
      throw new LoginError('Original Auth no confirmó tu acceso a tiempo.', 'not_validated');
    }
    const profile = await getMe(pending.session);
    sessionStore.set(pending.session);
    sessionStore.clearPending();
    setToken(pending.session);
    setMe(profile);
    setStatus('authenticated');
    return pending.from;
  }, []);

  const logout = useCallback(async () => {
    const current = token ?? sessionStore.get();
    // Se cierra la sesión en la pantalla de inmediato; avisar al servidor es un extra que puede fallar.
    sessionStore.clear();
    setToken(null);
    setMe(null);
    setStatus('anonymous');
    if (current) await logoutSession(current).catch(() => undefined);
  }, [token]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(
    () => ({ status, me, token, login, beginRealLogin, completeRealLogin, logout, retry }),
    [status, me, token, login, beginRealLogin, completeRealLogin, logout, retry],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return context;
}
