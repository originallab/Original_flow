import type { ReactNode } from 'react';
import { Logo } from '@/shared/ui/Logo';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

/** El marco de las pantallas de acceso (inicio de sesión, regreso y error de Original Auth): encabezado con el logotipo y una tarjeta al centro. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-bg text-text">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="grid flex-1 place-items-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-popover">{children}</div>
      </main>
    </div>
  );
}

/** El botón principal de las pantallas de acceso. */
export const authButtonClass =
  'w-full rounded-lg bg-violet px-4 py-2.5 text-center text-sm font-medium text-on-violet transition hover:bg-violet-hover disabled:cursor-not-allowed disabled:opacity-60';
