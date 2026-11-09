import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/** Campo de texto con su etiqueta, su ayuda y su mensaje de error asociados para lectores de pantalla. */
export function TextField({ label, error, hint, className, id, ...props }: Props) {
  const generated = useId();
  const inputId = id ?? generated;
  const messageId = `${inputId}-message`;
  return (
    <div className="block text-sm">
      <label htmlFor={inputId} className="text-text-2">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={cn(
          'mt-1 w-full rounded-lg border bg-surface-2 px-3 py-2 text-text outline-none focus:border-violet focus:ring-2 focus:ring-violet/30 disabled:opacity-70',
          error ? 'border-red-500' : 'border-border-strong',
          className,
        )}
        {...props}
      />
      {(error || hint) && (
        <p id={messageId} className={cn('mt-1 text-xs', error ? 'text-red-500' : 'text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
