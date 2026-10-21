import { useId, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/** El marco de una gráfica: su título, una línea que dice qué se ve y el contenido. */
export function ChartCard({ title, description, children, className }: { title: string; description: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn('@container rounded-2xl border border-border bg-surface p-5', className)}>
      <h2 id={id} className="font-heading text-base font-semibold">
        {title}
      </h2>
      <p className="mt-1 text-sm text-text-2">{description}</p>
      {/* Si una tabla no cabe en una tarjeta angosta, se desplaza dentro de ella en vez de sobresalir. */}
      <div className="-mx-1 mt-4 overflow-x-auto px-1">{children}</div>
    </section>
  );
}

/** Lo que se ve cuando una gráfica todavía no tiene datos. */
export function EmptyChart({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

/**
 * Una barra: delgada (20 px), con la punta redondeada y pegada a una sola línea base. Es decorativa: el
 * valor siempre está escrito en la celda de al lado, así que no depende de verla ni de pasar el cursor.
 */
export function BarMark({ ratio, color, title }: { ratio: number; color: string; title: string }) {
  const width = ratio > 0 ? Math.max(1.5, Math.min(100, ratio * 100)) : 0;
  return (
    <div aria-hidden className="h-5" title={title}>
      <div className="h-full rounded-r-[4px] transition-opacity hover:opacity-80" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

export const TH = 'pb-2 text-xs font-normal text-muted';
export const NUMBER = 'whitespace-nowrap pl-3 text-right tabular-nums';
