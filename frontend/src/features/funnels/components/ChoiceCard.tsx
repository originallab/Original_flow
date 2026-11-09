import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

interface Props {
  /** Nombre del grupo de opciones (todas las tarjetas del mismo paso comparten uno). */
  group: string;
  value: string;
  /** Texto que leen los lectores de pantalla como nombre de la opción. */
  label: string;
  selected: boolean;
  onSelect: () => void;
  /** No se puede elegir (por ejemplo, un tipo de funnel que todavía no está disponible). */
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Tarjeta de elección única (objetivo, plantilla). Es un radio de verdad escondido dentro de una
 * etiqueta: se maneja con teclado (flechas) y con lector de pantalla sin código extra.
 */
export function ChoiceCard({ group, value, label, selected, onSelect, disabled = false, children }: Props) {
  return (
    <label
      className={cn(
        'relative flex h-full flex-col rounded-xl border p-4 text-left transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-violet',
        disabled ? 'cursor-not-allowed border-border bg-surface opacity-60' : 'cursor-pointer',
        !disabled && (selected ? 'border-violet bg-violet-tint' : 'border-border bg-surface hover:border-border-strong'),
      )}
    >
      <input type="radio" name={group} value={value} checked={selected} onChange={onSelect} disabled={disabled} aria-label={label} className="sr-only" />
      {selected && (
        <span aria-hidden className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-violet text-on-violet">
          <Check size={12} />
        </span>
      )}
      {children}
    </label>
  );
}
