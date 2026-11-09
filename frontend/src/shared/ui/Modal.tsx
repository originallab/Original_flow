import { X } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Mientras es `true` no se cierra con Escape ni con un clic afuera (por ejemplo, mientras se está publicando). */
  locked?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Ventana modal accesible: avisa a los lectores de pantalla que es un diálogo, se cierra con Escape o
 * con un clic afuera, mantiene el teclado dentro de ella y devuelve el foco a donde estaba al cerrarse.
 */
export function Modal({ title, onClose, children, locked = false }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus?.();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !locked) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return event.preventDefault();
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && !locked && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-6 text-text shadow-popover outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-heading text-xl font-semibold">
            {title}
          </h2>
          <button type="button" aria-label="Cerrar" disabled={locked} onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-lg text-text-2 hover:bg-surface-2 disabled:opacity-40">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
