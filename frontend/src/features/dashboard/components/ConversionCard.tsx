import type { ConversionStage } from '@/services/analytics';
import { formatCount, formatPercent, rampStep } from '../format';
import { BarMark, ChartCard, EmptyChart, NUMBER, TH } from './ChartCard';

/** El embudo de visitas a clientes: una barra por etapa, de la más clara a la más intensa. */
export function ConversionCard({ stages }: { stages: ConversionStage[] }) {
  const max = Math.max(1, ...stages.map((stage) => stage.count));
  const empty = stages.every((stage) => stage.count === 0);
  return (
    <ChartCard title="Embudo de conversión" description="Cuántas personas llegan a cada etapa, de la visita al cliente.">
      {empty ? (
        <EmptyChart>Todavía no hay visitas ni leads en este periodo.</EmptyChart>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Personas en cada etapa del embudo, con su porcentaje de las visitas y de la etapa anterior</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className={TH}>
                Etapa
              </th>
              <th scope="col" className={TH}>
                <span className="sr-only">Proporción</span>
              </th>
              <th scope="col" className={`${TH} ${NUMBER}`}>
                Personas
              </th>
              <th scope="col" className={`${TH} ${NUMBER} hidden @xs:table-cell`}>
                De las visitas
              </th>
              <th scope="col" className={`${TH} ${NUMBER} hidden @xl:table-cell`}>
                De la anterior
              </th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage, index) => (
              <tr key={stage.key}>
                <th scope="row" className="w-28 py-1 pr-3 text-left font-normal">
                  {stage.label}
                </th>
                <td className="min-w-12 py-1">
                  <BarMark ratio={stage.count / max} color={`var(--chart-ramp-${rampStep(index, stages.length)})`} title={`${stage.label}: ${formatCount(stage.count)}`} />
                </td>
                <td className={`${NUMBER} font-medium`}>{formatCount(stage.count)}</td>
                <td className={`${NUMBER} hidden text-text-2 @xs:table-cell`}>{stage.percentOfVisits === null ? '—' : formatPercent(stage.percentOfVisits)}</td>
                <td className={`${NUMBER} hidden text-text-2 @xl:table-cell`}>{stage.percentOfPrevious === null ? '—' : formatPercent(stage.percentOfPrevious)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
