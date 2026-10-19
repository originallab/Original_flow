import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { WIZARD_STEPS } from '../catalog';

/** Menú lateral del wizard: los cuatro pasos (el actual resaltado, los anteriores con palomita) y un recordatorio de conversión. */
export function WizardRail({ current }: { current: number }) {
  return (
    <aside className="hidden w-72 shrink-0 flex-col justify-between border-r border-border bg-rail p-8 md:flex">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet px-3 py-1 text-xs font-medium text-violet-tint-text">
          <Sparkles size={12} aria-hidden />
          Nuevo funnel
        </span>

        <ol aria-label="Pasos del asistente" className="mt-8">
          {WIZARD_STEPS.map((step, index) => {
            const done = index < current;
            const active = index === current;
            return (
              <li key={step.title} aria-current={active ? 'step' : undefined} className="relative flex gap-3 pb-8 last:pb-0">
                {index < WIZARD_STEPS.length - 1 && <span aria-hidden className="absolute left-3.5 top-9 h-[calc(100%-2.25rem)] w-px bg-border-strong" />}
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                    (done || active) && 'border-violet bg-violet text-on-violet',
                    !done && !active && 'border-border-strong bg-surface text-muted',
                  )}
                >
                  {done ? <Check size={14} aria-hidden /> : index + 1}
                </span>
                <span>
                  <span className={cn('block text-sm font-medium', active || done ? 'text-text' : 'text-text-2')}>{step.title}</span>
                  <span className="block text-xs text-muted">{step.hint}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-medium">Cada paso mejora tu conversión</p>
        <div aria-hidden className="mt-3 space-y-1.5">
          {['100%', '78%', '55%', '35%'].map((width, index) => (
            <div key={width} className="h-1.5 rounded-full bg-violet" style={{ width, opacity: 1 - index * 0.22 }} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Visitas → Leads → Clientes</p>
      </div>
    </aside>
  );
}
