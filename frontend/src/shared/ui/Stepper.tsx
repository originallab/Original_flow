import { Check } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

/** Indicador de pasos (el paso actual va resaltado y los anteriores con una palomita). `current` empieza en 0. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol aria-label="Pasos" className="flex items-center gap-3">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} aria-current={active ? 'step' : undefined} className="flex items-center gap-3">
            <span
              className={cn(
                'grid size-7 place-items-center rounded-full border text-xs font-semibold',
                done && 'border-violet bg-violet text-on-violet',
                active && 'border-violet text-violet-tint-text',
                !done && !active && 'border-border-strong text-muted',
              )}
            >
              {done ? <Check size={14} aria-hidden /> : index + 1}
            </span>
            <span className={cn('text-sm', active || done ? 'font-medium text-text' : 'text-muted')}>{label}</span>
            {index < steps.length - 1 && <span aria-hidden className="hidden h-px w-10 bg-border-strong sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}
