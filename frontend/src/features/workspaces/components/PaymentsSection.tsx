import { useEffect, useId, useState, type FormEvent } from 'react';
import { ApiError } from '@/services/api';
import { connectPayments, getPaymentsStatus, type PaymentsStatus } from '@/services/payments';
import { PAYMENT_CURRENCIES, PAYMENT_LABELS, PAYMENT_METHODS, validateConnection, type PaymentMethod, type PaymentsConnection } from '@/shared/payments';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';

interface Props {
  token: string;
  workspaceId: string;
}

type Load = 'loading' | 'ready' | 'error';

/**
 * Conectar Original Pay al negocio: la llave de su app, la divisa y las formas de pago que acepta. Sin esto un
 * funnel que cobra no se puede publicar. La llave se guarda cifrada en el servidor y nunca se vuelve a mostrar.
 */
export function PaymentsSection({ token, workspaceId }: Props) {
  const methodsId = useId();
  const [status, setStatus] = useState<PaymentsStatus | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [currency, setCurrency] = useState<PaymentsConnection['currency']>('MXN');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoad('loading');
    getPaymentsStatus(token, workspaceId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setStatus(loaded);
        setLoad('ready');
      })
      .catch(() => !controller.signal.aborted && setLoad('error'));
    return () => controller.abort();
  }, [token, workspaceId, attempt]);

  function startEditing() {
    setApiKey('');
    setCurrency(status?.currency ?? 'MXN');
    setMethods(status?.methods ?? []);
    setErrors({});
    setFormError(null);
    setSaved(false);
    setEditing(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const body: PaymentsConnection = { apiKey: apiKey.trim(), currency, methods };
    const issues = validateConnection(body);
    setFormError(null);
    if (issues.length > 0) return setErrors(Object.fromEntries(issues.map((issue) => [String(issue.path[0]), issue.message])));
    setErrors({});
    setBusy(true);
    try {
      setStatus(await connectPayments(token, workspaceId, body));
      setApiKey('');
      setEditing(false);
      setSaved(true);
    } catch (err) {
      const fields = err instanceof ApiError && err.status === 422 ? err.fieldErrors() : {};
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError('No se pudo conectar Original Pay. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (method: PaymentMethod) => {
    setMethods((previous) => (previous.includes(method) ? previous.filter((item) => item !== method) : [...previous, method]));
    setErrors((previous) => ({ ...previous, methods: '' }));
  };

  return (
    <section aria-labelledby="pagos" className="mt-8 rounded-2xl border border-border bg-surface p-6">
      <h2 id="pagos" className="font-heading text-lg font-semibold">
        Pagos
      </h2>
      <p className="mt-1 text-sm text-text-2">Conecta Original Pay para cobrar en tus funnels de venta. Sin esto no se pueden publicar.</p>

      {load === 'loading' && (
        <p role="status" className="mt-4 text-sm text-text-2">
          Cargando…
        </p>
      )}
      {load === 'error' && (
        <div className="mt-4">
          <p role="alert" className="text-sm">
            No se pudo cargar el estado de los pagos.
          </p>
          <Button className="mt-3" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      )}

      {load === 'ready' && status && !editing && (
        <div className="mt-4">
          {status.connected ? (
            <>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-violet-tint px-2.5 py-0.5 text-xs font-medium text-violet-tint-text">Conectado</span>
                <span>Original Pay · {status.currency}</span>
              </p>
              <ul aria-label="Formas de pago" className="mt-3 flex flex-wrap gap-2">
                {(status.methods ?? []).map((method) => (
                  <li key={method} className="rounded-full bg-chip px-2.5 py-0.5 text-xs text-text-2">
                    {PAYMENT_LABELS[method] ?? method}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-text-2">Todavía no has conectado Original Pay.</p>
          )}
          {saved && (
            <p role="status" className="mt-3 text-sm text-violet-tint-text">
              Original Pay conectado.
            </p>
          )}
          <Button className="mt-4" variant={status.connected ? 'secondary' : 'primary'} onClick={startEditing}>
            {status.connected ? 'Cambiar la conexión' : 'Conectar Original Pay'}
          </Button>
        </div>
      )}

      {load === 'ready' && editing && (
        <form onSubmit={submit} noValidate aria-label="Conectar Original Pay" className="mt-4 space-y-4">
          <TextField
            label="Llave de Original Pay"
            type="password"
            autoComplete="off"
            value={apiKey}
            error={errors.apiKey}
            hint="Se guarda cifrada y no se vuelve a mostrar."
            onChange={(event) => {
              setApiKey(event.target.value);
              setErrors((previous) => ({ ...previous, apiKey: '' }));
            }}
          />
          <div className="text-sm">
            <label htmlFor={`${methodsId}-currency`} className="text-text-2">
              Divisa
            </label>
            <select
              id={`${methodsId}-currency`}
              value={currency}
              onChange={(event) => setCurrency(event.target.value as PaymentsConnection['currency'])}
              className="mt-1 block h-10 rounded-lg border border-border-strong bg-surface-2 px-3 text-text outline-none focus:border-violet focus:ring-2 focus:ring-violet/30"
            >
              {PAYMENT_CURRENCIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="text-sm" aria-describedby={errors.methods ? `${methodsId}-error` : undefined}>
            <legend className="text-text-2">Formas de pago que aceptas</legend>
            <div className="mt-1 space-y-1.5">
              {PAYMENT_METHODS.map((method) => (
                <label key={method} className="flex items-center gap-2">
                  <input type="checkbox" checked={methods.includes(method)} onChange={() => toggle(method)} />
                  {PAYMENT_LABELS[method]}
                </label>
              ))}
            </div>
            {errors.methods && (
              <p id={`${methodsId}-error`} className="mt-1 text-xs text-red-500">
                {errors.methods}
              </p>
            )}
          </fieldset>
          {formError && (
            <p role="alert" className="text-sm text-red-500">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Conectando…' : 'Conectar'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
