import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell, authButtonClass } from '@/features/auth/components/AuthShell';
import { sessionStore } from '@/features/auth/sessionStore';

/**
 * A donde regresa Original Auth cuando el inicio de sesión falló (`/auth/error`). Solo avisa y ofrece volver a
 * intentarlo: no muestra lo que venga en la dirección (no se confía en ello) y descarta el inicio en curso.
 */
export function AuthErrorPage() {
  useEffect(() => {
    sessionStore.clearPending();
  }, []);

  return (
    <AuthShell>
      <h1 className="font-heading text-2xl font-semibold">No se pudo iniciar sesión</h1>
      <p role="alert" className="mt-3 text-sm text-text-2">
        Original Auth no pudo completar tu inicio de sesión. Puedes intentarlo de nuevo; si el problema sigue, avisa a quien administra tu cuenta.
      </p>
      <Link to="/login" replace className={`${authButtonClass} mt-6 block`}>
        Volver a iniciar sesión
      </Link>
    </AuthShell>
  );
}
