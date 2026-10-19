import { Navigate, Outlet } from 'react-router-dom';
import { Logo } from '@/shared/ui/Logo';
import { LoadState } from './LoadState';
import { useWorkspaces } from './WorkspaceProvider';

/**
 * Protege las pantallas que necesitan un negocio: mientras se cargan no muestra nada, si no se
 * pudieron cargar ofrece reintentar, y si la persona todavía no tiene ninguno la manda a la bienvenida.
 */
export function RequireWorkspace() {
  const { status, workspaces } = useWorkspaces();

  if (status !== 'ready') {
    return (
      <Gate>
        <LoadState />
      </Gate>
    );
  }
  if (workspaces.length === 0) return <Navigate to="/bienvenida" replace />;
  return <Outlet />;
}

/** Pantalla de espera: el logotipo siempre va arriba a la izquierda. */
function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-bg text-text">
      <header className="flex h-16 items-center border-b border-border bg-surface px-6">
        <Logo />
      </header>
      <main className="grid flex-1 place-items-center px-6">{children}</main>
    </div>
  );
}
