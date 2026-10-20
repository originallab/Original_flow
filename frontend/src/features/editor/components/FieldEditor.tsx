import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import type { FieldDef } from '@/shared/blocks/catalog';
import { Button } from '@/shared/ui/Button';
import { TextAreaField } from '@/shared/ui/TextAreaField';
import { TextField } from '@/shared/ui/TextField';
import { cn } from '@/shared/utils/cn';
import { isoToLocalInput, localInputToIso, moveItem, removeAt, replaceAt, withKey } from '../fieldHelpers';

interface Props {
  def: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Mensajes de error por ruta («items.0.title»). */
  errors: Record<string, string>;
  /** Ruta de este campo dentro del contenido del bloque. */
  path: string;
  /** El objeto que contiene este campo (para los campos que dependen de otro). */
  parent: Record<string, unknown>;
}

const inputClass = (invalid: boolean) =>
  cn('mt-1 w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-violet focus:ring-2 focus:ring-violet/30', invalid ? 'border-red-500' : 'border-border-strong');

const asText = (value: unknown) => (typeof value === 'string' ? value : '');

/** Un campo del panel de propiedades. Se dibuja a partir de su definición en el catálogo de bloques, así que sirve para todos los tipos. */
export function FieldEditor({ def, value, onChange, errors, path, parent }: Props) {
  const error = errors[path];
  const id = useId();

  switch (def.kind) {
    case 'text': {
      // Un campo opcional que se deja vacío se quita del contenido (el backend rechaza textos vacíos).
      const emit = (next: string) => onChange(next === '' && !def.required ? undefined : next);
      return def.multiline ? (
        <TextAreaField label={def.label} value={asText(value)} onChange={(e) => emit(e.target.value)} error={error} hint={def.hint} rows={4} />
      ) : (
        <TextField label={def.label} value={asText(value)} onChange={(e) => emit(e.target.value)} error={error} hint={def.hint} />
      );
    }

    case 'url':
      return <TextField label={def.label} value={asText(value)} onChange={(e) => onChange(e.target.value === '' && !def.required ? undefined : e.target.value)} error={error} hint={def.hint} inputMode="url" spellCheck={false} />;

    case 'datetime':
      return (
        <div className="text-sm">
          <label htmlFor={id} className="text-text-2">
            {def.label}
          </label>
          <input id={id} type="datetime-local" value={isoToLocalInput(value)} onChange={(e) => onChange(localInputToIso(e.target.value))} aria-invalid={error ? true : undefined} className={inputClass(Boolean(error))} />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
      );

    case 'group':
      return (
        <fieldset className="space-y-4 rounded-xl border border-border bg-surface-2 p-3">
          <legend className="px-1 text-sm font-medium">{def.label}</legend>
          {def.fields.map((field) => {
            const group = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
            return <FieldEditor key={field.key} def={field} value={group[field.key]} onChange={(next) => onChange(withKey(group, field.key, next))} errors={errors} path={`${path}.${field.key}`} parent={group} />;
          })}
        </fieldset>
      );

    case 'number':
      return (
        <div className="text-sm">
          <label htmlFor={id} className="text-text-2">
            {def.label}
          </label>
          <input
            id={id}
            type="number"
            min={def.min}
            max={def.max}
            step={def.integer ? 1 : 'any'}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            aria-invalid={error ? true : undefined}
            className={inputClass(Boolean(error))}
          />
          {(error || def.hint) && <p className={cn('mt-1 text-xs', error ? 'text-red-500' : 'text-muted')}>{error ?? def.hint}</p>}
        </div>
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm text-text-2">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-violet" />
          {def.label}
        </label>
      );

    case 'select':
      return (
        <div className="text-sm">
          <label htmlFor={id} className="text-text-2">
            {def.label}
          </label>
          <select id={id} value={asText(value)} onChange={(e) => onChange(e.target.value)} className={inputClass(Boolean(error))}>
            {def.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );

    case 'list': {
      if (def.showIf && !def.showIf(parent)) return null;
      const items = Array.isArray(value) ? value : [];
      const itemName = def.itemLabel.toLowerCase();
      const set = (next: unknown[]) => onChange(next.length === 0 && def.min === 0 ? undefined : next);

      return (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{def.label}</legend>
          {items.map((item, index) => {
            const itemPath = `${path}.${index}`;
            const actions = (
              <span className="flex shrink-0 gap-1">
                <button type="button" aria-label={`Subir ${itemName} ${index + 1}`} disabled={index === 0} onClick={() => set(moveItem(items, index, -1))} className="grid size-7 place-items-center rounded-md text-text-2 hover:bg-surface-2 disabled:opacity-30">
                  <ArrowUp size={14} aria-hidden />
                </button>
                <button type="button" aria-label={`Bajar ${itemName} ${index + 1}`} disabled={index === items.length - 1} onClick={() => set(moveItem(items, index, 1))} className="grid size-7 place-items-center rounded-md text-text-2 hover:bg-surface-2 disabled:opacity-30">
                  <ArrowDown size={14} aria-hidden />
                </button>
                <button type="button" aria-label={`Quitar ${itemName} ${index + 1}`} disabled={items.length <= def.min} onClick={() => set(removeAt(items, index))} className="grid size-7 place-items-center rounded-md text-text-2 hover:bg-surface-2 hover:text-red-500 disabled:opacity-30">
                  <Trash2 size={14} aria-hidden />
                </button>
              </span>
            );

            if (def.of.kind === 'text') {
              return (
                <div key={index} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <TextField label={`${def.itemLabel} ${index + 1}`} value={asText(item)} onChange={(e) => set(replaceAt(items, index, e.target.value))} error={errors[itemPath]} />
                  </div>
                  <div className="pt-6">{actions}</div>
                </div>
              );
            }

            const object = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
            return (
              <div key={index} role="group" aria-label={`${def.itemLabel} ${index + 1}`} className="rounded-xl border border-border bg-surface-2 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {def.itemLabel} {index + 1}
                  </p>
                  {actions}
                </div>
                <div className="space-y-3">
                  {def.of.fields.map((field) => (
                    <FieldEditor key={field.key} def={field} value={object[field.key]} onChange={(next) => set(replaceAt(items, index, withKey(object, field.key, next)))} errors={errors} path={`${itemPath}.${field.key}`} parent={object} />
                  ))}
                </div>
              </div>
            );
          })}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button
            variant="secondary"
            size="sm"
            disabled={items.length >= def.max}
            onClick={() => set([...items, def.of.kind === 'text' ? (def.of.sample ?? `Nuevo ${itemName}`) : def.of.create()])}
          >
            <Plus size={14} aria-hidden /> Agregar {itemName}
          </Button>
        </fieldset>
      );
    }
  }
}
