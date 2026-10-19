import { Info, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SAMPLE_FUNNELS } from '@/features/funnels/catalog';
import { buttonStyles } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';

/**
 * CÁSCARA de la lista de funnels: muestra datos de ejemplo y enlaza al asistente de creación.
 * Todavía no lee los funnels del backend ni se pueden abrir.
 */
export function FunnelsPage() {
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

      <p role="note" className="mt-6 flex items-start gap-2 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text-2">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        Estos son datos de ejemplo. Aquí aparecerán tus funnels reales cuando se conecte esta pantalla.
      </p>

      <ul aria-label="Funnels de ejemplo" className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {SAMPLE_FUNNELS.map((funnel) => (
          <li key={funnel.id} className="grid items-center gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[1fr_auto_5rem_8rem]">
            <div className="min-w-0">
              <p className="truncate font-medium">{funnel.name}</p>
              <p className="text-sm text-muted">{funnel.goal}</p>
            </div>
            <span
              className={cn(
                'w-fit rounded-full px-2.5 py-0.5 text-xs font-medium',
                funnel.published ? 'bg-violet-tint text-violet-tint-text' : 'bg-chip text-text-2',
              )}
            >
              {funnel.published ? 'Publicado' : 'Borrador'}
            </span>
            <p className="text-sm text-text-2 sm:text-right">
              <span className="font-medium text-text">{funnel.leads}</span> leads
            </p>
            <p className="text-sm text-muted sm:text-right">{funnel.updated}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
