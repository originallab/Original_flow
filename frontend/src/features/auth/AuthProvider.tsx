import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '@/services/api';
import { createSession, getMe, logoutSession, mockCallback, validateSession, type MeResponse, type MockIdentity } from '@/services/auth';
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
  logout: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** El login no se completó (por ejemplo, Original Auth no validó la sesión). */
export class LoginError extends Error {}

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

  const value = useMemo(() => ({ status, me, token, login, logout, retry }), [status, me, token, login, logout, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return context;
}
