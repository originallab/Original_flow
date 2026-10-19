import { X } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { useWorkspaces } from '@/features/workspaces/WorkspaceProvider';
import { Logo } from '@/shared/ui/Logo';

/**
 * Estructura del asistente de creación de funnels: pantalla completa, sin menú de la plataforma.
 * El logotipo va arriba a la izquierda como en todas las pantallas; la «X» vuelve a la lista de funnels.
 */
export function WizardLayout() {
  const { active } = useWorkspaces();
  return (
    <div className="flex min-h-full flex-col bg-bg text-text">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-6">
        <Logo />
        <span aria-hidden className="hidden h-6 w-px bg-border-strong sm:block" />
        <span className="hidden truncate text-sm text-text-2 sm:inline">Configura tu nuevo funnel</span>
        <div className="ml-auto flex items-center gap-3">
          {active && <span className="hidden truncate text-sm text-muted sm:inline">{active.name}</span>}
          <Link
            to="/funnels"
            aria-label="Cerrar el asistente"
            className="grid size-9 place-items-center rounded-lg border border-border bg-surface text-text-2 transition hover:border-border-strong hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
          >
            <X size={16} aria-hidden />
          </Link>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
