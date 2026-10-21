import { useAuth } from '@/features/auth/AuthProvider';
import { useWorkspaces } from '@/features/workspaces/WorkspaceProvider';
import { canViewDashboard } from '@/shared/utils/permissions';
import { DashboardPage } from './DashboardPage';

/** Inicio de la plataforma: el dashboard para quien puede verlo y, para el resto (el diseñador), un saludo. */
export function HomePage() {
  const { me } = useAuth();
  const { active } = useWorkspaces();
  if (!me || !active) return null;
  // Con `key` el dashboard empieza de cero (sin filtros) al cambiar de negocio.
  if (canViewDashboard(active.role)) return <DashboardPage key={active.id} />;
  const nombre = me.user.name ?? me.user.email;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="font-heading text-3xl font-semibold">Hola, {nombre}</h1>
      <p className="mt-3 text-text-2">
        Estás trabajando en <strong className="text-text">{active.name}</strong>. Tu rol no incluye el dashboard: entra a Funnels para crear y editar páginas.
      </p>
    </div>
  );
}
