import { Search } from 'lucide-react';
import type { FunnelSummary } from '@/services/funnels';

interface Props {
  funnels: FunnelSummary[];
  funnelId: string;
  query: string;
  onFunnel: (funnelId: string) => void;
  onQuery: (query: string) => void;
}

const CONTROL = 'h-10 rounded-lg border border-border-strong bg-surface px-3 text-sm text-text outline-none focus:border-violet focus:ring-2 focus:ring-violet/30';

/** Buscar por nombre, correo o teléfono y quedarse con los leads de un funnel. */
export function LeadFilters({ funnels, funnelId, query, onFunnel, onQuery }: Props) {
  return (
    <div role="search" className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1 text-sm sm:max-w-sm">
        <label htmlFor="lead-search" className="text-text-2">
          Buscar
        </label>
        <div className="relative mt-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input id="lead-search" type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Nombre, correo o teléfono" className={`${CONTROL} w-full pl-9`} />
        </div>
      </div>
      <div className="text-sm">
        <label htmlFor="lead-funnel" className="text-text-2">
          Funnel
        </label>
        <select id="lead-funnel" value={funnelId} onChange={(event) => onFunnel(event.target.value)} className={`${CONTROL} mt-1 block min-w-48`}>
          <option value="">Todos</option>
          {funnels.map((funnel) => (
            <option key={funnel.id} value={funnel.id}>
              {funnel.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
