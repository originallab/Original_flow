import { useAuth } from '@/features/auth/AuthProvider';
import { useWorkspaces } from '@/features/workspaces/WorkspaceProvider';

/** Pantalla de inicio de la plataforma. Los funnels, los leads y las métricas llegan en las siguientes piezas. */
export function HomePage() {
  const { me } = useAuth();
  const { active } = useWorkspaces();
  if (!me || !active) return null;
  const nombre = me.user.name ?? me.user.email;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="font-heading text-3xl font-semibold">Hola, {nombre}</h1>
      <p className="mt-3 text-text-2">
        Estás trabajando en <strong className="text-text">{active.name}</strong>. Aquí vivirán tus funnels, tus leads y tus métricas; llegan
        en las siguientes piezas.
      </p>
    </div>
  );
}
