import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { describeVariation, type Variation } from '../format';

const STYLE: Record<Variation['kind'], { icon?: LucideIcon; text: string }> = {
  up: { icon: ArrowUpRight, text: 'text-emerald-700 dark:text-emerald-400' },
  down: { icon: ArrowDownRight, text: 'text-red-600 dark:text-red-400' },
  new: { icon: ArrowUpRight, text: 'text-emerald-700 dark:text-emerald-400' },
  flat: { text: 'text-muted' },
  none: { text: 'text-muted' },
};

interface Props {
  label: string;
  children: ReactNode;
  /** Cómo cambió frente al periodo anterior; sin esto no se muestra nada. */
  change?: Variation;
  mode?: 'percent' | 'points';
  hint?: string;
}

/** Una cifra del resumen con su cambio frente al periodo anterior (la flecha y el texto, nunca solo el color). */
export function StatTile({ label, children, change, mode = 'percent', hint }: Props) {
  const style = change ? STYLE[change.kind] : undefined;
  const Icon = style?.icon;
  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm text-text-2">{label}</p>
      <div className="mt-1 text-3xl font-semibold leading-tight">{children}</div>
      {change && (
        <p className={cn('mt-2 flex flex-wrap items-center gap-x-1 text-xs', style?.text)}>
          {Icon && <Icon size={14} aria-hidden />}
          <span className="font-medium">{describeVariation(change, mode)}</span>
          {change.kind !== 'none' && <span className="text-muted">vs. periodo anterior</span>}
        </p>
      )}
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </li>
  );
}
