import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoginError, useAuth } from '@/features/auth/AuthProvider';
import { ApiError } from '@/services/api';
import { Logo } from '@/shared/ui/Logo';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

/** ¿Está activo el acceso simulado a Original Auth? Solo en desarrollo y solo si se pidió con VITE_AUTH_MODE. */
const isMockAuth = () => import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE === 'mock_callback';

function messageFor(err: unknown): string {
  if (err instanceof LoginError) return err.message;
  if (err instanceof ApiError) {
    if (err.status === 422) return 'Revisa los datos: escribe un correo válido.';
    return err.message;
  }
  return 'No se pudo iniciar sesión. Intenta de nuevo.';
}

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('demo@originalflow.test');
  const [name, setName] = useState('Persona de Prueba');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') return <Navigate to={from} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ email: email.trim(), name: name.trim() || undefined });
      navigate(from, { replace: true });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-bg text-text">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="grid flex-1 place-items-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-popover">
          <h1 className="font-heading text-2xl font-semibold">Inicia sesión</h1>
          <p className="mt-2 text-sm text-text-2">Accede a tu cuenta de Original Flow con Original Auth.</p>

          {isMockAuth() ? (
            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
              <p className="rounded-lg border border-violet-tint-border bg-violet-tint px-3 py-2 text-xs text-violet-tint-text">
                Modo de desarrollo: Original Auth está simulado. Entra con cualquier correo.
              </p>

              <label className="block text-sm">
                <span className="text-text-2">Correo</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="mt-1 w-full rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-text outline-none focus:border-violet focus:ring-2 focus:ring-violet/30"
                />
              </label>

              <label className="block text-sm">
                <span className="text-text-2">Nombre (opcional)</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="mt-1 w-full rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-text outline-none focus:border-violet focus:ring-2 focus:ring-violet/30"
                />
              </label>

              {error && (
                <p role="alert" className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || email.trim() === ''}
                className="w-full rounded-lg bg-violet px-4 py-2.5 text-sm font-medium text-on-violet transition hover:bg-violet-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
          ) : (
            <p role="status" className="mt-6 rounded-lg border border-border-strong bg-surface-2 px-3 py-3 text-sm text-text-2">
              El acceso con Original Auth todavía no está configurado en esta versión.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
