import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/shared/ui/Logo';
import { useAuth } from './AuthProvider';

/** Pantalla de espera o de error mientras se comprueba la sesión. El logotipo va siempre arriba a la izquierda. */
function SessionGate({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-bg text-text">
      <header className="flex h-16 items-center border-b border-border bg-surface px-6">
        <Logo />
      </header>
      <main className="grid flex-1 place-items-center px-6">{children}</main>
    </div>
  );
}

/**
 * Protege un grupo de rutas: sin sesión manda a /login (recordando a dónde iba); mientras se
 * comprueba la sesión no muestra nada protegido; si el servidor no responde ofrece reintentar.
 */
export function ProtectedRoute() {
  const { status, retry } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <SessionGate>
        <p role="status" className="text-sm text-text-2">
          Comprobando tu sesión…
        </p>
      </SessionGate>
    );
  }
  if (status === 'unavailable') {
    return (
      <SessionGate>
        <div className="text-center">
          <p role="alert" className="text-text">
            No se pudo conectar con el servidor.
          </p>
          <button type="button" onClick={retry} className="mt-4 rounded-lg bg-violet px-4 py-2 text-sm font-medium text-on-violet hover:bg-violet-hover">
            Reintentar
          </button>
        </div>
      </SessionGate>
    );
  }
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
