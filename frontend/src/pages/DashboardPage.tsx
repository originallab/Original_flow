import { Funnel as FunnelIcon, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { ConversionCard } from '@/features/dashboard/components/ConversionCard';
import { DashboardFilters } from '@/features/dashboard/components/DashboardFilters';
import { DropOffCard } from '@/features/dashboard/components/DropOffCard';
import { FunnelsCard } from '@/features/dashboard/components/FunnelsCard';
import { SourcesCard } from '@/features/dashboard/components/SourcesCard';
import { StatTile } from '@/features/dashboard/components/StatTile';
import { formatCount, formatMoney, formatPercent, variation } from '@/features/dashboard/format';
import { useDashboard } from '@/features/dashboard/useDashboard';
import { useWorkspaces } from '@/features/workspaces/WorkspaceProvider';
import type { Money, Range } from '@/services/analytics';
import { Button, buttonStyles } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';

/** Dinero del periodo: cada divisa en su línea (nunca se suman monedas distintas) y, sin ventas, una raya. */
function MoneyTile({ label, money }: { label: string; money: Money[] }) {
  if (money.length === 0) {
    return (
      <StatTile label={label} hint="Llega con los pagos.">
        —
      </StatTile>
    );
  }
  const only = money.length === 1 ? money[0] : undefined;
  return (
    <StatTile label={label} change={only && variation(only.value, only.previous)}>
      {money.map((item) => (
        <p key={item.currency}>{formatMoney(item)}</p>
      ))}
    </StatTile>
  );
}

/** El resumen del negocio activo: cuánta gente llega, cuánta deja sus datos, de dónde viene y en qué parte de la página se va. */
export function DashboardPage() {
  const { me, token } = useAuth();
  const { active } = useWorkspaces();
  const [funnelId, setFunnelId] = useState('');
  const [range, setRange] = useState<Range>('30d');
  const dashboard = useDashboard(token, active?.id, funnelId, range);
  if (!me || !active) return null;

  const name = me.user.name ?? me.user.email;
  const { data } = dashboard;
  const noFunnels = dashboard.status === 'ready' && dashboard.funnels.length === 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="font-heading text-3xl font-semibold">Hola, {name}</h1>
      <p className="mt-2 text-text-2">
        Así va <strong className="text-text">{active.name}</strong>.
      </p>

      {dashboard.status === 'loading' && (
        <p role="status" className="mt-8 text-sm text-text-2">
          Cargando tu dashboard…
        </p>
      )}

      {dashboard.status === 'error' && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <p role="alert">No se pudo cargar tu dashboard.</p>
          <Button className="mt-4" onClick={dashboard.retry}>
            Reintentar
          </Button>
        </div>
      )}

      {noFunnels && (
        <div className="mt-8 rounded-2xl border border-dashed border-border-strong bg-surface p-10 text-center">
          <FunnelIcon size={28} className="mx-auto text-violet-tint-text" aria-hidden />
          <h2 className="mt-3 font-heading text-lg font-semibold">Todavía no tienes funnels</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-2">Cuando publiques el primero y llegue gente, aquí verás sus visitas, sus leads y de dónde vienen.</p>
          <Link to="/funnels/nuevo" className={cn(buttonStyles(), 'mt-5')}>
            <Plus size={16} aria-hidden /> Crear mi primer funnel
          </Link>
        </div>
      )}

      {dashboard.status === 'ready' && data && !noFunnels && (
        <div className="mt-8 space-y-6">
          <DashboardFilters funnels={dashboard.funnels} funnelId={funnelId} range={range} onFunnel={setFunnelId} onRange={setRange} />

          <div aria-busy={dashboard.refreshing} className={cn('space-y-6 transition-opacity', dashboard.refreshing && 'opacity-60')}>
            <ul aria-label="Resumen del periodo" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <StatTile label="Visitas" change={variation(data.summary.visits.value, data.summary.visits.previous)}>
                {formatCount(data.summary.visits.value)}
              </StatTile>
              <StatTile label="Leads" change={variation(data.summary.leads.value, data.summary.leads.previous)}>
                {formatCount(data.summary.leads.value)}
              </StatTile>
              <StatTile label="Conversión" mode="points" change={variation(data.summary.conversion.value, data.summary.conversion.previous, 'points')}>
                {formatPercent(data.summary.conversion.value)}
              </StatTile>
              <MoneyTile label="Ingresos" money={data.summary.revenue} />
              <MoneyTile label="Ticket promedio" money={data.summary.averageTicket} />
            </ul>

            <div className="grid gap-6 lg:grid-cols-2">
              <ConversionCard stages={data.stages} />
              <SourcesCard items={data.sources} />
            </div>

            <DropOffCard funnelName={dashboard.funnels.find((funnel) => funnel.id === funnelId)?.name ?? null} rows={data.dropOff ?? []} />
            <FunnelsCard items={data.performance} />
          </div>
        </div>
      )}
    </div>
  );
}
