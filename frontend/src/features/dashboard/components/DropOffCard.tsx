import type { DropOffRow } from '@/services/analytics';
import { formatPercent, sectionLabel } from '../format';
import { BarMark, ChartCard, EmptyChart, NUMBER, TH } from './ChartCard';

interface Props {
  /** El funnel elegido arriba; sin él no hay una página de la que hablar. */
  funnelName: string | null;
  rows: DropOffRow[];
}

/**
 * En qué sección de la página se pierde la gente. Es una sola serie, así que se destaca lo que importa:
 * todas las barras en gris y la sección donde más gente se va, con el color de la marca y su etiqueta.
 */
export function DropOffCard({ funnelName, rows }: Props) {
  const worst = rows.reduce<DropOffRow | null>((acc, row) => (row.dropPoints > 0 && (!acc || row.dropPoints > acc.dropPoints) ? row : acc), null);
  const empty = rows.every((row) => row.reachedPercent === 0);
  return (
    <ChartCard title="Dónde abandonan" description={funnelName ? `Qué porcentaje de las visitas llega a cada sección de «${funnelName}».` : 'Qué porcentaje de las visitas llega a cada sección de una página.'}>
      {!funnelName ? (
        <EmptyChart>Elige un funnel arriba para ver en qué sección de su página abandonan.</EmptyChart>
      ) : rows.length === 0 ? (
        <EmptyChart>Esta página todavía no tiene secciones.</EmptyChart>
      ) : empty ? (
        <EmptyChart>Todavía no hay visitas en este periodo.</EmptyChart>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Porcentaje de visitas que llega a cada sección y puntos que se pierden respecto a la anterior</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className={TH}>
                Sección
              </th>
              <th scope="col" className={TH}>
                <span className="sr-only">Proporción</span>
              </th>
              <th scope="col" className={`${TH} ${NUMBER}`}>
                Llegan
              </th>
              <th scope="col" className={`${TH} ${NUMBER}`}>
                Se pierden
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const highlight = row === worst;
              return (
                <tr key={row.section}>
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    {sectionLabel(row.section)}
                    {highlight && <span className="mt-0.5 block w-fit rounded-full bg-violet-tint px-2 py-0.5 text-xs font-medium text-violet-tint-text">Mayor abandono</span>}
                  </th>
                  <td className="min-w-12 py-1">
                    <BarMark ratio={row.reachedPercent / 100} color={highlight ? 'var(--chart-1)' : 'var(--muted)'} title={`${sectionLabel(row.section)}: llega el ${formatPercent(row.reachedPercent)}`} />
                  </td>
                  <td className={`${NUMBER} font-medium`}>{formatPercent(row.reachedPercent)}</td>
                  <td className={`${NUMBER} ${highlight ? 'font-medium' : 'text-text-2'}`}>{row.dropPoints > 0 ? `−${row.dropPoints} pts` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
