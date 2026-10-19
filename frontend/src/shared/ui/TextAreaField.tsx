import { useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
}

/** Área de texto con su etiqueta y su ayuda asociadas (hermana de TextField para textos largos). */
export function TextAreaField({ label, hint, className, id, rows = 3, ...props }: Props) {
  const generated = useId();
  const textId = id ?? generated;
  const hintId = `${textId}-hint`;
  return (
    <div className="block text-sm">
      <label htmlFor={textId} className="text-text-2">
        {label}
      </label>
      <textarea
        id={textId}
        rows={rows}
        aria-describedby={hint ? hintId : undefined}
        className={cn('mt-1 w-full resize-y rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-text outline-none focus:border-violet focus:ring-2 focus:ring-violet/30', className)}
        {...props}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
