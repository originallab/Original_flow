import { useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
}

/** Lista desplegable con su etiqueta y su mensaje de error asociados para lectores de pantalla (hermana de `TextField`). */
export function SelectField({ label, error, className, id, children, ...props }: Props) {
  const generated = useId();
  const selectId = id ?? generated;
  const messageId = `${selectId}-message`;
  return (
    <div className="block text-sm">
      <label htmlFor={selectId} className="text-text-2">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? messageId : undefined}
        className={cn(
          'mt-1 w-full rounded-lg border bg-surface-2 px-3 py-2 text-text outline-none focus:border-violet focus:ring-2 focus:ring-violet/30 disabled:opacity-70',
          error ? 'border-red-500' : 'border-border-strong',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p id={messageId} className="mt-1 text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
