import { Funnel as FunnelIcon, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { goalOf } from '@/features/funnels/catalog';
import { useWorkspaces } from '@/features/workspaces/WorkspaceProvider';
import { listFunnels, type FunnelSummary } from '@/services/funnels';
import { Button, buttonStyles } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; funnels: FunnelSummary[] };

const formatDate = (iso: string) => new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(iso));

/** Los funnels del negocio activo, del más nuevo al más viejo. Cada uno abre su editor. */
export function FunnelsPage() {
  const { token } = useAuth();
  const { active } = useWorkspaces();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const workspaceId = active?.id;

  useEffect(() => {
    if (!token || !workspaceId) return;
    let cancelled = false;
    setState({ status: 'loading' });
    listFunnels(token, workspaceId)
      .then((funnels) => !cancelled && setState({ status: 'ready', funnels }))
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [token, workspaceId, attempt]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Funnels</h1>
          <p className="mt-2 text-text-2">Las páginas que captan leads y ventas para tu negocio.</p>
        </div>
        <Link to="/funnels/nuevo" className={buttonStyles()}>
          <Plus size={16} aria-hidden /> Nuevo funnel
        </Link>
      </div>

      <div className="mt-8">
        {state.status === 'loading' && (
          <p role="status" className="text-sm text-text-2">
            Cargando tus funnels…
          </p>
        )}

        {state.status === 'error' && (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p role="alert">No se pudieron cargar tus funnels.</p>
            <Button className="mt-4" onClick={() => setAttempt((n) => n + 1)}>
              Reintentar
            </Button>
          </div>
        )}

        {state.status === 'ready' && state.funnels.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface p-10 text-center">
            <FunnelIcon size={28} className="mx-auto text-violet-tint-text" aria-hidden />
            <h2 className="mt-3 font-heading text-lg font-semibold">Todavía no tienes funnels</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-text-2">Crea el primero: eliges qué quieres lograr, cuentas de tu producto y armamos la página para que la ajustes.</p>
            <Link to="/funnels/nuevo" className={cn(buttonStyles(), 'mt-5')}>
              <Plus size={16} aria-hidden /> Crear mi primer funnel
            </Link>
          </div>
        )}

        {state.status === 'ready' && state.funnels.length > 0 && (
          <ul aria-label="Tus funnels" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {state.funnels.map((funnel) => (
              <li key={funnel.id}>
                <Link
                  to={`/funnels/${funnel.id}/editor`}
                  className="grid items-center gap-x-6 gap-y-2 px-5 py-4 transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet sm:grid-cols-[1fr_auto_8rem]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{funnel.name}</p>
                    <p className="text-sm text-muted">{goalOf(funnel.objective).name}</p>
                  </div>
                  <span
                    className={cn(
                      'w-fit rounded-full px-2.5 py-0.5 text-xs font-medium',
                      funnel.status === 'published' ? 'bg-violet-tint text-violet-tint-text' : 'bg-chip text-text-2',
                    )}
                  >
                    {funnel.status === 'published' ? 'Publicado' : 'Borrador'}
                  </span>
                  <p className="text-sm text-muted sm:text-right">{formatDate(funnel.updatedAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
