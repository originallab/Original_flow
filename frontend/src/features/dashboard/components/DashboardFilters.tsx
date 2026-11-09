import type { FunnelSummary } from '@/services/funnels';
import { RANGES, type Range } from '@/services/analytics';
import { cn } from '@/shared/utils/cn';

interface Props {
  funnels: FunnelSummary[];
  funnelId: string;
  range: Range;
  onFunnel: (funnelId: string) => void;
  onRange: (range: Range) => void;
}

/** Los filtros del dashboard, en una sola fila arriba: valen para todo lo que está debajo. */
export function DashboardFilters({ funnels, funnelId, range, onFunnel, onRange }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <fieldset>
        <legend className="text-sm text-text-2">Periodo</legend>
        <div className="mt-1 inline-flex rounded-lg border border-border-strong bg-surface p-0.5">
          {RANGES.map((item) => (
            <label
              key={item.value}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-sm transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-violet',
                range === item.value ? 'bg-violet-tint font-medium text-violet-tint-text' : 'text-text-2 hover:text-text',
              )}
            >
              <input type="radio" name="periodo" value={item.value} checked={range === item.value} onChange={() => onRange(item.value)} className="sr-only" />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="text-sm">
        <label htmlFor="dashboard-funnel" className="text-text-2">
          Funnel
        </label>
        <select
          id="dashboard-funnel"
          value={funnelId}
          onChange={(event) => onFunnel(event.target.value)}
          className="mt-1 block h-10 min-w-52 rounded-lg border border-border-strong bg-surface px-3 text-sm text-text outline-none focus:border-violet focus:ring-2 focus:ring-violet/30"
        >
          <option value="">Todos los funnels</option>
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
