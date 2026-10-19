import { Building2, Home, LogOut, Plus } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { useWorkspaces } from '@/features/workspaces/WorkspaceProvider';
import { Logo } from '@/shared/ui/Logo';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { cn } from '@/shared/utils/cn';

const NAV = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/negocio', label: 'Mi negocio', icon: Building2, end: false },
];

function Nav({ vertical }: { vertical: boolean }) {
  return (
    <nav aria-label="Navegación principal" className={cn('flex gap-1', vertical ? 'flex-col' : 'flex-row overflow-x-auto')}>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
              isActive ? 'bg-violet-tint font-medium text-violet-tint-text' : 'text-text-2 hover:bg-surface hover:text-text',
            )
          }
        >
          <Icon size={16} aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Estructura de las pantallas de la plataforma: encabezado con el logotipo completo arriba a la
 * izquierda (en todas las pantallas), el modo claro/oscuro y la persona con su cierre de sesión;
 * y un menú lateral con el selector del negocio activo.
 */
export function PlatformLayout() {
  const { me, logout } = useAuth();
  const { workspaces, active, setActive } = useWorkspaces();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-full flex-col bg-bg text-text">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
        <Logo />
        <div className="flex items-center gap-3">
          {me && <span className="hidden text-sm text-text-2 sm:inline">{me.user.email}</span>}
          <ThemeToggle />
          <button
            type="button"
            aria-label="Cerrar sesión"
            onClick={() => void logout()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-text-2 transition hover:border-border-strong hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
          >
            <LogOut size={15} aria-hidden />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-border bg-rail p-4 md:w-60 md:shrink-0 md:border-b-0 md:border-r">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="negocio-activo">
            Negocio
          </label>
          <select
            id="negocio-activo"
            aria-label="Negocio activo"
            value={active?.id ?? ''}
            onChange={(e) => setActive(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm text-text outline-none focus:border-violet"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => navigate('/bienvenida')}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-violet-tint-text hover:underline"
          >
            <Plus size={13} aria-hidden />
            Nuevo negocio
          </button>

          <div className="mt-5 md:hidden">
            <Nav vertical={false} />
          </div>
          <div className="mt-5 hidden md:block">
            <Nav vertical />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
