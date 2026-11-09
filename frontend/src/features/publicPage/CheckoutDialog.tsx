import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { buttonStyle, BUTTON } from '@/features/pageRenderer/public';
import type { PageTheme } from '@/features/pageRenderer/theme';
import { ApiError } from '@/services/api';
import type { PublicPage } from '@/services/publicPages';
import { PAYMENT_LABELS, validateCheckout, type CheckoutBody, type PaymentMethod } from '@/shared/payments';

interface Props {
  page: PublicPage;
  theme: PageTheme;
  /** Crea la orden y lleva a la persona a pagar; lanza el error de la API si falla. */
  onSubmit: (body: CheckoutBody, idempotencyKey: string) => Promise<void>;
  onClose: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FIELDS = ['name', 'email', 'phone', 'paymentMethod', 'consent'];

/** Lo que se le dice a quien no pudo empezar la compra, según lo que respondió el servidor. */
function problemOf(err: unknown): { fields: Record<string, string>; form: string; newKey?: boolean } {
  if (err instanceof ApiError) {
    if (err.status === 422) {
      const fields: Record<string, string> = {};
      for (const [path, message] of Object.entries(err.fieldErrors())) if (FIELDS.includes(path)) fields[path] = message;
      if (Object.keys(fields).length > 0) return { fields, form: '' };
      return { fields: {}, form: 'Esta compra no está disponible por ahora.' };
    }
    if (err.status === 409 && err.code === 'ORDER_ALREADY_PAID') return { fields: {}, form: 'Ya compraste esto: tu pago ya está confirmado.' };
    if (err.status === 409) return { fields: {}, form: 'Revisa tus datos e inténtalo de nuevo.', newKey: true };
    if (err.status === 404) return { fields: {}, form: 'Esta página ya no está disponible.' };
    if (err.status === 429) return { fields: {}, form: 'Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.' };
    if (err.status === 503) return { fields: {}, form: 'El pago no está disponible en este momento. Inténtalo de nuevo en unos minutos.' };
  }
  return { fields: {}, form: 'No se pudo iniciar el pago. Revisa tu conexión e inténtalo de nuevo.' };
}

function money(value: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language, { style: 'currency', currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

/**
 * La compra dentro de la página: pide nombre y correo, deja elegir la forma de pago y lleva a Original Pay.
 * Cada intento usa su propia clave de idempotencia y un reintento con los mismos datos la repite, para que
 * un doble clic o un fallo de red nunca cobre dos veces. Usa los colores de la página, no los de la plataforma.
 */
export function CheckoutDialog({ page, theme, onSubmit, onClose }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const key = useRef(crypto.randomUUID());
  const lastSent = useRef<string | null>(null);
  const methods = page.paymentMethods ?? [];
  const [values, setValues] = useState({ name: '', email: '', phone: '' });
  const [method, setMethod] = useState<PaymentMethod | undefined>(methods[0]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = page.price === null ? '' : money(page.price, page.currency, page.language);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('input')?.focus();
    return () => previous?.focus?.();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return event.preventDefault();
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const body: CheckoutBody = { name: values.name, email: values.email, ...(values.phone.trim() ? { phone: values.phone } : {}), ...(method ? { paymentMethod: method } : {}), consent };
    const issues = validateCheckout(body);
    setFormError(null);
    if (issues.length > 0) {
      setErrors(Object.fromEntries(issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    // Con otros datos es otra compra: clave nueva. Con los mismos (un reintento), la misma.
    const fingerprint = `${values.email.trim().toLowerCase()}|${method ?? ''}`;
    if (lastSent.current !== null && lastSent.current !== fingerprint) key.current = crypto.randomUUID();
    lastSent.current = fingerprint;
    setBusy(true);
    try {
      await onSubmit(body, key.current);
      // La persona sale hacia el pago: el botón se queda ocupado hasta que cambie de página.
    } catch (err) {
      const problem = problemOf(err);
      if (problem.newKey) key.current = crypto.randomUUID();
      setErrors(problem.fields);
      setFormError(problem.form || null);
      setBusy(false);
    }
  }

  const set = (field: keyof typeof values) => (event: { target: { value: string } }) => {
    setValues((previous) => ({ ...previous, [field]: event.target.value }));
    setErrors((previous) => ({ ...previous, [field]: '' }));
  };
  const control = 'mt-1 w-full border bg-white px-3 py-2 text-base text-neutral-900 outline-none focus:ring-2';
  const inputStyle = { borderRadius: '8px', borderColor: `${theme.palette.secondary}55` };
  const field = (name: 'name' | 'email' | 'phone', label: string, type: string, autoComplete: string, required: boolean) => (
    <div className="text-sm">
      <label htmlFor={`${titleId}-${name}`} className="opacity-80">
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        id={`${titleId}-${name}`}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={values[name]}
        onChange={set(name)}
        aria-required={required || undefined}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${titleId}-${name}-error` : undefined}
        className={control}
        style={inputStyle}
      />
      {errors[name] && (
        <p id={`${titleId}-${name}-error`} className="mt-1 text-xs font-medium" style={{ color: '#B42318' }}>
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="max-h-full w-full max-w-md overflow-y-auto p-6 shadow-xl"
        style={{ background: theme.palette.background, color: theme.palette.text, borderRadius: theme.look.radius }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-heading leading-tight" style={{ fontWeight: theme.look.headingWeight, textTransform: theme.look.headingTransform }}>
            Completa tu compra
          </h2>
          <button type="button" aria-label="Cerrar" disabled={busy} onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-lg opacity-70 hover:opacity-100 disabled:opacity-40">
            <X size={16} aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-sm opacity-80">
          {page.name}
          {total && <strong className="ml-2 text-base">{total}</strong>}
        </p>

        <form onSubmit={submit} noValidate aria-label="Datos de la compra" className="mt-5 space-y-3">
          {field('name', 'Nombre', 'text', 'name', true)}
          {field('email', 'Correo', 'email', 'email', true)}
          {field('phone', 'Teléfono', 'tel', 'tel', false)}

          {methods.length > 1 && (
            <fieldset className="text-sm">
              <legend className="opacity-80">Forma de pago</legend>
              <div className="mt-1 space-y-1.5">
                {methods.map((item) => (
                  <label key={item} className="flex items-center gap-2">
                    <input type="radio" name="paymentMethod" value={item} checked={method === item} onChange={() => setMethod(item)} />
                    {PAYMENT_LABELS[item] ?? item}
                  </label>
                ))}
              </div>
              {errors.paymentMethod && (
                <p className="mt-1 text-xs font-medium" style={{ color: '#B42318' }}>
                  {errors.paymentMethod}
                </p>
              )}
            </fieldset>
          )}

          <div className="text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={consent}
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={errors.consent ? `${titleId}-consent-error` : undefined}
                onChange={(event) => {
                  setConsent(event.target.checked);
                  setErrors((previous) => ({ ...previous, consent: '' }));
                }}
                className="mt-0.5 size-4"
              />
              <span className="opacity-80">Acepto que usen mis datos para procesar mi compra y contactarme.</span>
            </label>
            {errors.consent && (
              <p id={`${titleId}-consent-error`} className="mt-1 text-xs font-medium" style={{ color: '#B42318' }}>
                {errors.consent}
              </p>
            )}
          </div>

          {formError && (
            <p role="alert" className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#B42318', color: '#B42318' }}>
              {formError}
            </p>
          )}

          <div className="pt-1 text-center">
            <button type="submit" disabled={busy} className={BUTTON} style={buttonStyle(theme)}>
              {busy ? 'Te llevamos a pagar…' : total ? `Pagar ${total}` : 'Pagar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
