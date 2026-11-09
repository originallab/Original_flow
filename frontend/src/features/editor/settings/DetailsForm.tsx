import { useEffect, useState } from 'react';
import { ApiError } from '@/services/api';
import { updateFunnel, type Currency, type Funnel, type FunnelChanges } from '@/services/funnels';
import type { FieldDef } from '@/shared/blocks/catalog';
import { fieldMessages, validateFields } from '@/shared/blocks/validate';
import { FUNNEL_TYPES } from '@/shared/funnelTypes';
import { deepEqual, withKey } from '../fieldHelpers';
import { FieldEditor } from '../components/FieldEditor';
import { SaveBar } from './SaveBar';

interface Props {
  funnel: Funnel;
  token: string;
  onSaved: (funnel: Funnel) => void;
  onDirtyChange: (dirty: boolean) => void;
}

/** Minúsculas, números y guiones sueltos entre palabras (el mismo formato que valida el backend). */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: 'MXN', label: 'Pesos mexicanos (MXN)' },
  { value: 'USD', label: 'Dólares (USD)' },
  { value: 'CLP', label: 'Pesos chilenos (CLP)' },
];

function fieldsFor(charges: boolean): FieldDef[] {
  const base: FieldDef[] = [
    { kind: 'text', key: 'name', label: 'Nombre del funnel', max: 120, required: true },
    {
      kind: 'text',
      key: 'slug',
      label: 'Dirección de la página',
      max: 60,
      min: 3,
      required: true,
      hint: 'Va al final del enlace de tu página. Minúsculas, números y guiones, por ejemplo mi-curso-de-datos.',
      pattern: { regex: SLUG, message: 'Usa minúsculas, números y guiones (sin espacios ni guiones dobles).' },
    },
  ];
  return charges
    ? [...base, { kind: 'number', key: 'price', label: 'Precio', min: 0, hint: 'Mayor a cero para poder publicar.' }, { kind: 'select', key: 'currency', label: 'Divisa', options: CURRENCIES }]
    : base;
}

const valuesOf = (funnel: Funnel): Record<string, unknown> => ({ name: funnel.name, slug: funnel.slug, price: funnel.price ?? undefined, currency: funnel.currency });

/** Nombre, dirección de la página y (si el funnel cobra) precio y divisa. Se guardan con su botón. */
export function DetailsForm({ funnel, token, onSaved, onDirtyChange }: Props) {
  const charges = FUNNEL_TYPES[funnel.objective].charges;
  const fields = fieldsFor(charges);
  const [saved, setSaved] = useState(() => valuesOf(funnel));
  const [values, setValues] = useState(() => valuesOf(funnel));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const dirty = !deepEqual(values, saved);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  async function save() {
    const trimmed: Record<string, unknown> = { ...values, name: typeof values.name === 'string' ? values.name.trim() : values.name, slug: typeof values.slug === 'string' ? values.slug.trim() : values.slug };
    const issues = validateFields(fields, trimmed);
    if (issues.length > 0) {
      setErrors(fieldMessages(issues));
      setResult({ kind: 'error', message: 'Revisa los campos marcados.' });
      return;
    }
    const changes: FunnelChanges = {};
    if (trimmed.name !== saved.name) changes.name = trimmed.name as string;
    if (trimmed.slug !== saved.slug) changes.slug = trimmed.slug as string;
    if (charges && trimmed.price !== saved.price) changes.price = typeof trimmed.price === 'number' ? trimmed.price : null;
    if (charges && trimmed.currency !== saved.currency) changes.currency = trimmed.currency as Currency;

    setBusy(true);
    setErrors({});
    setResult(null);
    try {
      const updated = await updateFunnel(token, funnel.id, changes);
      const next = valuesOf(updated);
      setSaved(next);
      setValues(next);
      setResult({ kind: 'ok', message: 'Cambios guardados.' });
      onSaved(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ slug: 'Ese enlace ya lo usa otro funnel. Prueba con otro.' });
        setResult({ kind: 'error', message: 'No se guardó.' });
      } else if (err instanceof ApiError && Object.keys(err.fieldErrors()).length > 0) {
        setErrors(err.fieldErrors());
        setResult({ kind: 'error', message: 'Revisa los campos marcados.' });
      } else {
        setResult({ kind: 'error', message: err instanceof ApiError ? err.message : 'No se pudo guardar. Intenta de nuevo.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="ajustes-datos" aria-labelledby="ajustes-datos-titulo" className="space-y-4">
      <h3 id="ajustes-datos-titulo" className="font-heading text-base font-semibold">
        Datos del funnel
      </h3>
      {fields.map((field) => (
        <FieldEditor key={field.key} def={field} value={values[field.key]} onChange={(next) => { setValues((previous) => withKey(previous, field.key, next)); setResult(null); }} errors={errors} path={field.key} parent={values} />
      ))}
      <SaveBar label="Guardar datos" dirty={dirty} busy={busy} onSave={() => void save()} result={result} />
    </section>
  );
}
