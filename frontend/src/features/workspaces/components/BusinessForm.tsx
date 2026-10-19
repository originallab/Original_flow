import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '@/services/api';
import { Button } from '@/shared/ui/Button';
import { Combobox } from '@/shared/ui/Combobox';
import { TextField } from '@/shared/ui/TextField';
import { cn } from '@/shared/utils/cn';
import { INDUSTRIES, type BusinessValues } from '../brand';
import { COUNTRY_OPTIONS } from '../countries';

interface Props {
  initial: BusinessValues;
  submitLabel: string;
  /** Recibe los valores ya recortados. Si lanza un ApiError 422 sus mensajes se muestran en cada campo. */
  onSubmit: (values: BusinessValues) => Promise<void>;
  /** Solo lectura: quien no puede editar el negocio ve los datos, pero no los cambia. */
  readOnly?: boolean;
  /** Elemento a la izquierda del pie (por ejemplo «Atrás»). */
  leading?: ReactNode;
  hint?: string;
  /** Más secciones dentro del mismo formulario (por ejemplo la marca): comparten el botón de guardar. */
  children?: ReactNode;
}

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'No se pudo guardar. Intenta de nuevo.');

/** Datos del negocio: nombre, país, sitio web y rubro. La usan el alta del negocio y «Mi negocio». */
export function BusinessForm({ initial, submitLabel, onSubmit, readOnly = false, leading, hint, children }: Props) {
  const [values, setValues] = useState<BusinessValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof BusinessValues) => (value: string) => setValues((previous) => ({ ...previous, [key]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || readOnly) return;
    const trimmed: BusinessValues = {
      name: values.name.trim(),
      country: values.country.trim(),
      website: values.website.trim(),
      industry: values.industry,
    };
    if (trimmed.name === '') {
      setErrors({ name: 'Escribe el nombre de tu negocio.' });
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <TextField
        label="Nombre del negocio"
        value={values.name}
        onChange={(e) => set('name')(e.target.value)}
        error={errors.name}
        disabled={readOnly}
        maxLength={120}
        autoComplete="organization"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Combobox label="País" options={COUNTRY_OPTIONS} value={values.country} onChange={set('country')} error={errors.country} disabled={readOnly} placeholder="Elige un país" />
        <TextField
          label="Sitio web (opcional)"
          value={values.website}
          onChange={(e) => set('website')(e.target.value)}
          error={errors.website}
          disabled={readOnly}
          maxLength={200}
          inputMode="url"
        />
      </div>

      <fieldset disabled={readOnly}>
        <legend className="text-sm text-text-2">¿A qué se dedica tu negocio?</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {INDUSTRIES.map((industry) => {
            const selected = values.industry === industry.value;
            return (
              <label
                key={industry.value}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition',
                  selected ? 'border-violet bg-violet-tint font-medium text-violet-tint-text' : 'border-border-strong bg-surface-2 text-text-2 hover:text-text',
                  readOnly && 'cursor-default opacity-80',
                )}
              >
                <input
                  type="radio"
                  name="industry"
                  value={industry.value}
                  checked={selected}
                  onChange={() => set('industry')(industry.value)}
                  className="accent-violet"
                />
                {industry.label}
              </label>
            );
          })}
        </div>
        {errors.industry && <p className="mt-1 text-xs text-red-500">{errors.industry}</p>}
      </fieldset>

      {children}

      {formError && (
        <p role="alert" className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text">
          {formError}
        </p>
      )}

      {!readOnly && (
        <div className="flex items-center justify-between gap-4 pt-2">
          <div className="min-w-24">{leading}</div>
          {hint && <p className="hidden text-xs text-muted sm:block">{hint}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? 'Guardando…' : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
