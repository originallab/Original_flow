import { ChevronDown } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/shared/utils/cn';

export interface ComboOption {
  value: string;
  label: string;
}

interface Props {
  label: string;
  options: ComboOption[];
  /** Valor elegido (`''` = ninguno). Si no está en la lista (un dato antiguo) se muestra tal cual hasta que se elija otro. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
}

/** Sin mayúsculas, acentos ni espacios sobrantes: «mexico» encuentra «México». */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Combobox de elección única (patrón ARIA «combobox con lista»): se escribe para filtrar y se elige
 * con el ratón o con el teclado (flechas, Enter, Escape). Solo se puede quedar con una opción de la
 * lista: si lo escrito no coincide con ninguna, al salir del campo vuelve a lo que estaba elegido.
 */
export function Combobox({ label, options, value, onChange, error, hint, disabled, placeholder, emptyText = 'Sin resultados' }: Props) {
  const baseId = useId();
  const listId = `${baseId}-lista`;
  const messageId = `${baseId}-mensaje`;
  const optionId = (index: number) => `${baseId}-opcion-${index}`;

  const [text, setText] = useState<string | null>(null); // null = no se está editando
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.value === value);
  const shown = text ?? selected?.label ?? value;

  const filtered = useMemo(() => {
    const query = text === null || text === selected?.label ? '' : fold(text);
    if (query === '') return options;
    const starts = options.filter((option) => fold(option.label).startsWith(query));
    const contains = options.filter((option) => !fold(option.label).startsWith(query) && fold(option.label).includes(query));
    return [...starts, ...contains];
  }, [options, text, selected?.label]);

  function choose(option: ComboOption) {
    onChange(option.value);
    setText(null);
    setOpen(false);
  }

  function scrollTo(index: number) {
    listRef.current?.children[index]?.scrollIntoView?.({ block: 'nearest' });
  }

  function move(delta: number) {
    if (!open) {
      setOpen(true);
      return;
    }
    const next = Math.min(Math.max(active + delta, 0), filtered.length - 1);
    setActive(next);
    scrollTo(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter' && open && filtered[active]) {
      event.preventDefault(); // elegir no debe enviar el formulario
      choose(filtered[active]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setText(null);
    }
  }

  function onBlur() {
    setOpen(false);
    if (text === null) return;
    const exact = options.find((option) => fold(option.label) === fold(text));
    if (exact) onChange(exact.value);
    else if (text.trim() === '') onChange('');
    setText(null); // si no coincide con nada, vuelve a lo que estaba elegido
  }

  return (
    <div className="block text-sm">
      <label htmlFor={baseId} className="text-text-2">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={baseId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? optionId(active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          autoComplete="off"
          spellCheck={false}
          value={shown}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            setOpen(true);
            setActive(0);
            const exact = options.find((option) => fold(option.label) === fold(next) && fold(next) !== '');
            if (exact) onChange(exact.value);
          }}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className={cn(
            'w-full rounded-lg border bg-surface-2 py-2 pl-3 pr-9 text-text outline-none focus:border-violet focus:ring-2 focus:ring-violet/30 disabled:opacity-70',
            error ? 'border-red-500' : 'border-border-strong',
          )}
        />
        <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />

        {open && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            // El ratón no debe quitarle el foco al campo antes de elegir.
            onMouseDown={(event) => event.preventDefault()}
            className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border-strong bg-surface py-1 shadow-popover"
          >
            {filtered.length === 0 ? (
              <li role="presentation" className="px-3 py-2 text-muted">
                {emptyText}
              </li>
            ) : (
              filtered.map((option, index) => (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                  className={cn(
                    'cursor-pointer px-3 py-1.5',
                    index === active && 'bg-violet-tint text-violet-tint-text',
                    option.value === value && 'font-medium',
                  )}
                >
                  {option.label}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {(error || hint) && (
        <p id={messageId} className={cn('mt-1 text-xs', error ? 'text-red-500' : 'text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
