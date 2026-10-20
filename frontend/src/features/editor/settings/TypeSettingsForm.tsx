import { useEffect, useState } from 'react';
import { ApiError } from '@/services/api';
import { saveTypeConfig, type Funnel } from '@/services/funnels';
import { fieldMessages } from '@/shared/blocks/validate';
import { FUNNEL_TYPES, validateTypeConfig } from '@/shared/funnelTypes';
import { cloneJson, deepEqual, withKey } from '../fieldHelpers';
import { FieldEditor } from '../components/FieldEditor';
import { SaveBar } from './SaveBar';

interface Props {
  funnel: Funnel;
  token: string;
  onSaved: (funnel: Funnel) => void;
  onDirtyChange: (dirty: boolean) => void;
}

const asObject = (value: unknown): Record<string, unknown> | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/**
 * Los ajustes propios del tipo de funnel (el mensaje de agradecimiento de un formulario, el enlace del
 * calendario, el medio de pago…). Si todavía no hay nada guardado, empieza con valores sugeridos que
 * se aplican al guardar. Hay que tenerlos completos para poder publicar.
 */
export function TypeSettingsForm({ funnel, token, onSaved, onDirtyChange }: Props) {
  const def = FUNNEL_TYPES[funnel.objective];
  const savedConfig = asObject(funnel.typeConfig);
  const [saved, setSaved] = useState<Record<string, unknown> | null>(savedConfig);
  const [values, setValues] = useState<Record<string, unknown>>(() => cloneJson(savedConfig ?? def.initial()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const dirty = !deepEqual(values, saved);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  async function save() {
    const issues = validateTypeConfig(funnel.objective, values);
    if (issues.length > 0) {
      setErrors(fieldMessages(issues));
      setResult({ kind: 'error', message: 'Completa los campos marcados.' });
      return;
    }
    setBusy(true);
    setErrors({});
    setResult(null);
    try {
      const response = await saveTypeConfig(token, funnel.id, values);
      setSaved(response.typeConfig);
      setValues(cloneJson(response.typeConfig));
      setResult({ kind: 'ok', message: 'Ajustes guardados.' });
      onSaved({ ...funnel, typeConfig: response.typeConfig });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors()).length > 0) {
        setErrors(err.fieldErrors());
        setResult({ kind: 'error', message: 'Completa los campos marcados.' });
      } else {
        setResult({ kind: 'error', message: err instanceof ApiError ? err.message : 'No se pudieron guardar los ajustes. Intenta de nuevo.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="ajustes-tipo" aria-labelledby="ajustes-tipo-titulo" className="space-y-4">
      <h3 id="ajustes-tipo-titulo" className="font-heading text-base font-semibold">
        Ajustes del funnel
      </h3>
      {saved === null && <p className="text-sm text-text-2">Todavía no guardas estos ajustes. Revisa los valores sugeridos y guárdalos.</p>}
      {def.fields.map((field) => (
        <FieldEditor
          key={field.key}
          def={field}
          value={values[field.key]}
          onChange={(next) => {
            setValues((previous) => withKey(previous, field.key, next));
            setResult(null);
          }}
          errors={errors}
          path={field.key}
          parent={values}
        />
      ))}
      <SaveBar label="Guardar ajustes" dirty={dirty} busy={busy} onSave={() => void save()} result={result} hint={saved === null ? 'Aún no están guardados.' : undefined} />
    </section>
  );
}
