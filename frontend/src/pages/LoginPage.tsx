import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoginError, useAuth } from '@/features/auth/AuthProvider';
import { AuthShell, authButtonClass } from '@/features/auth/components/AuthShell';
import { isLocalPath } from '@/features/auth/sessionStore';
import { ApiError } from '@/services/api';
import { isMockAuth } from '@/services/auth';
import { isDemoMode } from '@/services/demo';
import { isRealAuthConfigured } from '@/services/originalAuth';

function messageFor(err: unknown): string {
  if (err instanceof LoginError) return err.message;
  if (err instanceof ApiError) {
    if (err.status === 422) return 'Revisa los datos: escribe un correo válido.';
    return err.message;
  }
  return 'No se pudo iniciar sesión. Intenta de nuevo.';
}

export function LoginPage() {
  const { status, login, beginRealLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requested = (location.state as { from?: string } | null)?.from;
  const from = isLocalPath(requested) ? requested : '/';

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

  // El acceso real: manda a la persona a Original Auth (el navegador sale de la aplicación; si algo falla, se queda aquí).
  async function onRealLogin() {
    setError(null);
    setBusy(true);
    try {
      await beginRealLogin(from);
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="font-heading text-2xl font-semibold">Inicia sesión</h1>
      <p className="mt-2 text-sm text-text-2">Accede a tu cuenta de Original Flow con Original Auth.</p>

      {import.meta.env.DEV && isMockAuth() ? (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <p className="rounded-lg border border-violet-tint-border bg-violet-tint px-3 py-2 text-xs text-violet-tint-text">
            {isDemoMode()
              ? 'Modo demostración: no hace falta el servidor. Entra con cualquier correo; lo que hagas se guarda solo en este navegador.'
              : 'Modo de desarrollo: Original Auth está simulado. Entra con cualquier correo.'}
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

          <button type="submit" disabled={busy || email.trim() === ''} className={authButtonClass}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      ) : isRealAuthConfigured() ? (
        <div className="mt-6 space-y-4">
          {error && (
            <p role="alert" className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text">
              {error}
            </p>
          )}
          <button type="button" onClick={onRealLogin} disabled={busy} className={authButtonClass}>
            {busy ? 'Abriendo Original Auth…' : 'Continuar con Original Auth'}
          </button>
        </div>
      ) : (
        <p role="status" className="mt-6 rounded-lg border border-border-strong bg-surface-2 px-3 py-3 text-sm text-text-2">
          El acceso con Original Auth todavía no está configurado en esta versión.
        </p>
      )}
    </AuthShell>
  );
}
