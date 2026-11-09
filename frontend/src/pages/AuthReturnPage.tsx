import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell, authButtonClass } from '@/features/auth/components/AuthShell';
import { LoginError, useAuth } from '@/features/auth/AuthProvider';
import { sessionStore } from '@/features/auth/sessionStore';

type Result = { kind: 'checking' } | { kind: 'failed'; code: LoginError['code'] };

/**
 * A donde regresa Original Auth cuando la persona inició sesión (`/auth/return`). Espera a que el backend
 * confirme la sesión (Original Auth avisa por su cuenta al callback) y la deja iniciada.
 */
export function AuthReturnPage() {
  const { status, completeRealLogin } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState<Result>({ kind: 'checking' });
  const started = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    // Primero se espera a saber si ya había una sesión guardada; y se corre una sola vez por visita
    // (el modo estricto de React monta dos veces los efectos en desarrollo).
    if (status === 'loading' || started.current) return;
    started.current = true;
    // Quien ya tiene la sesión iniciada y no viene de un inicio en curso no tiene nada que hacer aquí.
    if (status === 'authenticated' && !sessionStore.getPending()) {
      navigate('/', { replace: true });
      return;
    }
    completeRealLogin().then(
      (from) => {
        if (alive.current) navigate(from, { replace: true });
      },
      (err: unknown) => {
        if (alive.current) setResult({ kind: 'failed', code: err instanceof LoginError ? err.code : 'failed' });
      },
    );
  }, [status, completeRealLogin, navigate]);

  return (
    <AuthShell>
      {result.kind === 'checking' ? (
        <>
          <h1 className="font-heading text-2xl font-semibold">Verificando tu acceso</h1>
          <p role="status" className="mt-3 text-sm text-text-2">
            Estamos confirmando tu inicio de sesión con Original Auth. Esto tarda unos segundos…
          </p>
        </>
      ) : (
        <>
          <h1 className="font-heading text-2xl font-semibold">No pudimos confirmar tu acceso</h1>
          <p role="alert" className="mt-3 text-sm text-text-2">
            {result.code === 'no_pending'
              ? 'No encontramos un inicio de sesión en curso en este navegador. Empieza de nuevo desde la pantalla de acceso.'
              : 'Original Auth no confirmó tu acceso a tiempo. Intenta iniciar sesión de nuevo.'}
          </p>
          <Link to="/login" replace className={`${authButtonClass} mt-6 block`}>
            Volver a iniciar sesión
          </Link>
        </>
      )}
    </AuthShell>
  );
}
