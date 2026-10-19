import { LogOut } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { Logo } from '@/shared/ui/Logo';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

/**
 * Estructura de las pantallas de la plataforma: encabezado con el logotipo completo arriba a la
 * izquierda (en todas las pantallas), el modo claro/oscuro y la persona con su cierre de sesión.
 */
export function PlatformLayout() {
  const { me, logout } = useAuth();
  return (
    <div className="flex min-h-full flex-col bg-bg text-text">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
        <Logo />
        <div className="flex items-center gap-3">
          {me && <span className="hidden text-sm text-text-2 sm:inline">{me.user.email}</span>}
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-text-2 transition hover:border-border-strong hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
