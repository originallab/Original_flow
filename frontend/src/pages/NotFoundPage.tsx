import { Link } from 'react-router-dom';
import { buttonStyles } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

/** Cualquier dirección que no existe (por ejemplo, la de una página pública que todavía no se dibuja aquí). */
export function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col bg-bg text-text">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="grid flex-1 place-items-center px-6 text-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-violet-tint-text">Error 404</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold">Esta página no existe</h1>
          <p className="mt-3 text-text-2">Revisa la dirección o vuelve al inicio.</p>
          <Link to="/" className={buttonStyles({ className: 'mt-6' })}>
            Ir al inicio
          </Link>
        </div>
      </main>
    </div>
  );
}
