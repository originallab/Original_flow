import { LogOut } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { Logo } from '@/shared/ui/Logo';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

/** Estructura del alta del negocio: sin menú lateral, pero con el logotipo arriba a la izquierda como en todas las pantallas. */
export function OnboardingLayout() {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-full flex-col bg-bg text-text">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
        <Logo />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            type="button"
            aria-label="Cerrar sesión"
            onClick={() => void logout()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-text-2 transition hover:border-border-strong hover:text-text"
          >
            <LogOut size={15} aria-hidden />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </header>
      <main className="flex-1 px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
