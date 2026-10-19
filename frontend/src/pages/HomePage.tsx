import { useAuth } from '@/features/auth/AuthProvider';

/** Pantalla de inicio temporal tras iniciar sesión. El alta del negocio y el resto llegan en las siguientes piezas. */
export function HomePage() {
  const { me } = useAuth();
  if (!me) return null;
  const nombre = me.user.name ?? me.user.email;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="font-heading text-3xl font-semibold">Hola, {nombre}</h1>
      {me.workspaces.length === 0 ? (
        <p className="mt-3 text-text-2">Todavía no tienes un negocio. El alta del negocio llega en la siguiente pieza.</p>
      ) : (
        <>
          <p className="mt-3 text-text-2">Tus negocios:</p>
          <ul className="mt-3 space-y-2">
            {me.workspaces.map((workspace) => (
              <li key={workspace.id} className="rounded-xl border border-border bg-surface px-4 py-3">
                {workspace.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
