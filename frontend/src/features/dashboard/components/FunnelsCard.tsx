import { Link } from 'react-router-dom';
import { goalOf } from '@/features/funnels/catalog';
import type { FunnelPerformance } from '@/services/analytics';
import { cn } from '@/shared/utils/cn';
import { formatCount, formatMoney, formatPercent } from '../format';
import { ChartCard, EmptyChart, NUMBER, TH } from './ChartCard';

/** El rendimiento de cada funnel. Es una tabla porque cada funnel tiene varias cifras que comparar; cada nombre abre su editor. */
export function FunnelsCard({ items }: { items: FunnelPerformance[] }) {
  return (
    <ChartCard title="Rendimiento por funnel" description="Visitas, leads y conversión de cada funnel en este periodo.">
      {items.length === 0 ? (
        <EmptyChart>Todavía no hay funnels.</EmptyChart>
      ) : (
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">Visitas, leads, conversión e ingresos de cada funnel</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className={TH}>
                Funnel
              </th>
              <th scope="col" className={TH}>
                Estado
              </th>
              <th scope="col" className={`${TH} ${NUMBER}`}>
                Visitas
              </th>
              <th scope="col" className={`${TH} ${NUMBER}`}>
                Leads
              </th>
              <th scope="col" className={`${TH} ${NUMBER}`}>
                Conversión
              </th>
              <th scope="col" className={`${TH} ${NUMBER}`}>
                Ingresos
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((funnel) => (
              <tr key={funnel.funnelId}>
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  <Link to={`/funnels/${funnel.funnelId}/editor`} className="font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet">
                    {funnel.name}
                  </Link>
                  <span className="block text-xs text-muted">{goalOf(funnel.objective).name}</span>
                </th>
                <td>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', funnel.status === 'published' ? 'bg-violet-tint text-violet-tint-text' : 'bg-chip text-text-2')}>
                    {funnel.status === 'published' ? 'Publicado' : 'Borrador'}
                  </span>
                </td>
                <td className={NUMBER}>{formatCount(funnel.visits)}</td>
                <td className={`${NUMBER} font-medium`}>{formatCount(funnel.leads)}</td>
                <td className={NUMBER}>{formatPercent(funnel.conversion)}</td>
                <td className={`${NUMBER} text-text-2`}>{funnel.revenue.length === 0 ? '—' : funnel.revenue.map((money) => formatMoney(money)).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
