import type { SourceRow } from '@/services/analytics';
import { formatCount, formatPercent } from '../format';
import { BarMark, ChartCard, EmptyChart, NUMBER, TH } from './ChartCard';

/** De dónde vienen las visitas: una barra por origen, con cuántas dejaron sus datos. Un solo color: la longitud ya dice la cantidad. */
export function SourcesCard({ items }: { items: SourceRow[] }) {
  const max = Math.max(1, ...items.map((item) => item.clicks));
  return (
    <ChartCard title="De dónde vienen tus visitas" description="Las campañas y sitios que más personas traen, y cuántas de ellas dejan sus datos.">
      {items.length === 0 ? (
        <EmptyChart>Todavía no hay visitas en este periodo.</EmptyChart>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Visitas por origen, con su porcentaje del total y su conversión</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className={TH}>
                Origen
              </th>
              <th scope="col" className={TH}>
                <span className="sr-only">Proporción</span>
              </th>
              <th scope="col" className={`${TH} ${NUMBER}`}>
                Visitas
              </th>
              <th scope="col" className={`${TH} ${NUMBER} hidden @lg:table-cell`}>
                Del total
              </th>
              <th scope="col" className={`${TH} ${NUMBER}`}>
                Conversión
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.source}>
                <th scope="row" className="max-w-24 truncate py-1 pr-3 text-left font-normal @sm:max-w-40" title={item.source}>
                  {item.source}
                </th>
                <td className="min-w-12 py-1">
                  <BarMark ratio={item.clicks / max} color="var(--chart-1)" title={`${item.source}: ${formatCount(item.clicks)} visitas`} />
                </td>
                <td className={`${NUMBER} font-medium`}>{formatCount(item.clicks)}</td>
                <td className={`${NUMBER} hidden text-text-2 @lg:table-cell`}>{formatPercent(item.percent)}</td>
                <td className={`${NUMBER} text-text-2`}>{formatPercent(item.conversion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
