import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/services/api';
import { listCtas, updateCta, type Cta, type CtaActionType, type Funnel } from '@/services/funnels';
import { BLOCKS } from '@/shared/blocks/catalog';
import type { Block } from '@/shared/blocks/types';
import { FUNNEL_TYPES } from '@/shared/funnelTypes';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { SaveBar } from './SaveBar';

interface Props {
  funnel: Funnel;
  token: string;
  blocks: Block[];
  /** Cambia cada vez que se guarda el contenido (pueden haber nacido o muerto botones). */
  refreshKey: number;
  onChanged: () => void;
}

const URL_OK = /^https?:\/\/\S+$/i;
const ACTION_LABELS: Record<CtaActionType, string> = {
  scroll_to: 'Llevar a otra parte de la página',
  url: 'Abrir un enlace',
  checkout: 'Cobrar con Original Pay',
  form_submit: 'Enviar los datos del formulario',
};

/** Una fila: un botón o formulario de la página y a dónde lleva. */
function CtaRow({ cta, block, funnel, token, onChanged }: { cta: Cta; block: Block | undefined; funnel: Funnel; token: string; onChanged: () => void }) {
  const charges = FUNNEL_TYPES[funnel.objective].charges;
  const [saved, setSaved] = useState(cta);
  const [action, setAction] = useState<CtaActionType>(cta.actionType);
  const [destination, setDestination] = useState(cta.destination ?? '');
  const [tracking, setTracking] = useState(cta.trackingId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  const isForm = block?.type === 'formulario';
  const options: CtaActionType[] = isForm ? ['form_submit'] : charges ? ['scroll_to', 'url', 'checkout'] : ['scroll_to', 'url'];
  const dirty = action !== saved.actionType || (action === 'url' ? destination.trim() : '') !== (saved.destination ?? '') || tracking.trim() !== (saved.trackingId ?? '');

  async function save() {
    if (action === 'url' && destination.trim() !== '' && !URL_OK.test(destination.trim())) {
      setError('Escribe un enlace que empiece con http:// o https://');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const updated = await updateCta(token, funnel.id, cta.blockKey, {
        actionType: action,
        destination: action === 'url' && destination.trim() !== '' ? destination.trim() : null,
        trackingId: tracking.trim() === '' ? null : tracking.trim(),
      });
      setSaved(updated);
      setDestination(updated.destination ?? '');
      setResult({ kind: 'ok', message: 'Guardado.' });
      onChanged();
    } catch (err) {
      setResult({ kind: 'error', message: err instanceof ApiError ? err.message : 'No se pudo guardar. Intenta de nuevo.' });
    } finally {
      setBusy(false);
    }
  }

  const name = `${block ? BLOCKS[block.type].label : 'Bloque'}: ${cta.label}`;
  return (
    <li>
      <fieldset aria-label={name} className="space-y-3 rounded-xl border border-border bg-surface-2 p-3">
        <legend className="px-1 text-sm font-medium">{name}</legend>
        {isForm ? (
          <p className="text-sm text-text-2">{ACTION_LABELS.form_submit}.</p>
        ) : (
          <label className="block text-sm">
            <span className="text-text-2">¿Qué hace?</span>
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value as CtaActionType);
                setResult(null);
              }}
              className="mt-1 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text outline-none focus:border-violet"
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {ACTION_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        )}
        {action === 'url' && (
          <TextField
            label="Enlace"
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value);
              setError(null);
              setResult(null);
            }}
            error={error ?? (saved.actionType === 'url' && !saved.destination && destination.trim() === '' ? 'Falta el enlace: sin él no se puede publicar.' : undefined)}
            inputMode="url"
            spellCheck={false}
            placeholder="https://"
          />
        )}
        <TextField
          label="Identificador de seguimiento (opcional)"
          value={tracking}
          onChange={(e) => {
            setTracking(e.target.value);
            setResult(null);
          }}
          hint="Sirve para distinguir este botón en tus métricas."
          maxLength={100}
        />
        <SaveBar label="Guardar" dirty={dirty} busy={busy} onSave={() => void save()} result={result} />
      </fieldset>
    </li>
  );
}

/** Todos los botones y formularios de la página, con su acción. Nacen y mueren con sus bloques. */
export function CtaSettings({ funnel, token, blocks, refreshKey, onChanged }: Props) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; ctas: Cta[] }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(() => {
    let cancelled = false;
    listCtas(token, funnel.id)
      .then((ctas) => !cancelled && setState({ status: 'ready', ctas }))
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [token, funnel.id]);

  useEffect(() => load(), [load, refreshKey, attempt]);

  return (
    <section id="ajustes-cta" aria-labelledby="ajustes-cta-titulo" className="space-y-4">
      <h3 id="ajustes-cta-titulo" className="font-heading text-base font-semibold">
        Botones y formularios
      </h3>
      {state.status === 'loading' && (
        <p role="status" className="text-sm text-text-2">
          Cargando…
        </p>
      )}
      {state.status === 'error' && (
        <div>
          <p role="alert" className="text-sm text-red-500">
            No se pudieron cargar los botones.
          </p>
          <Button className="mt-2" size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      )}
      {state.status === 'ready' && state.ctas.length === 0 && <p className="text-sm text-text-2">Esta página no tiene botones ni formularios.</p>}
      {state.status === 'ready' && state.ctas.length > 0 && (
        <ul className="space-y-3">
          {state.ctas.map((cta) => (
            // La clave incluye lo que puede cambiar desde fuera, para que la fila se reinicie si el bloque cambió.
            <CtaRow key={`${cta.blockKey}:${cta.label}:${cta.actionType}`} cta={cta} block={blocks.find((b) => b.key === cta.blockKey)} funnel={funnel} token={token} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}
