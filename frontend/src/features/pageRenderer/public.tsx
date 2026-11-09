import { useEffect, useId, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '@/services/api';
import type { PublicCta } from '@/services/publicPages';
import type { Block } from '@/shared/blocks/types';
import { buildLeadBody, fieldForIssuePath, formFieldsOf, validateLead, type FormField, type LeadBody } from '@/shared/leads';
import { safeHttpUrl } from '@/shared/utils/safeUrl';
import { readableOn, type PageTheme } from './theme';

/**
 * Las partes de una página que solo funcionan en la página publicada: el formulario que manda el lead,
 * los botones con su acción y los elementos que cambian solos. Usan los colores de la página, nunca los de la plataforma.
 */

/** Lo que la página pública le da al renderizador para que los bloques interactivos funcionen. */
export interface PublicContext {
  ctas: PublicCta[];
  blocks: Block[];
  /** Un clic en un botón (para medirlo). */
  onCtaClick: (block: Block) => void;
  /** Baja hasta un bloque de la página. */
  scrollTo: (blockKey: string) => void;
  /** Manda el lead; lanza el error de la API si falla. */
  submitLead: (body: LeadBody) => Promise<void>;
  /** El precio del producto (`null` si todavía no tiene) y cómo abrir la compra. */
  price: number | null;
  openCheckout: () => void;
}

export const buttonStyle = (theme: PageTheme): CSSProperties => ({
  background: theme.palette.primary,
  color: readableOn(theme.palette.primary, theme.palette),
  borderRadius: theme.look.radius,
});
export const BUTTON = 'inline-block px-6 py-3 text-sm font-semibold transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

export function PublicButtonLink({ theme, href, children, onClick }: { theme: PageTheme; href: string; children: ReactNode; onClick?: () => void }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={BUTTON} style={buttonStyle(theme)}>
      {children}
    </a>
  );
}

/**
 * Un botón de la página con la acción que le puso su dueño: abrir un enlace, bajar a otra parte de la
 * página o comprar. Los enlaces solo se abren si son http o https.
 */
export function CtaButton({ block, theme, ctx }: { block: Block; theme: PageTheme; ctx: PublicContext }) {
  const cta = ctx.ctas.find((c) => c.blockKey === block.key);
  const label = typeof block.content.label === 'string' ? block.content.label : '';

  if (cta?.actionType === 'url') {
    const href = safeHttpUrl(cta.destination);
    if (href) {
      return (
        <PublicButtonLink theme={theme} href={href} onClick={() => ctx.onCtaClick(block)}>
          {label}
        </PublicButtonLink>
      );
    }
    return (
      <button type="button" disabled className={BUTTON} style={buttonStyle(theme)}>
        {label}
      </button>
    );
  }

  if (cta?.actionType === 'checkout') {
    // Comprar: abre el formulario de la compra (el monto lo pone el servidor con el precio del funnel).
    const buyable = ctx.price !== null && ctx.price > 0;
    return (
      <button
        type="button"
        disabled={!buyable}
        title={buyable ? undefined : 'Este producto todavía no tiene precio'}
        onClick={() => {
          ctx.onCtaClick(block);
          ctx.openCheckout();
        }}
        className={BUTTON}
        style={buttonStyle(theme)}
      >
        {label}
      </button>
    );
  }

  // «Llevar a otra parte de la página»: al bloque que eligió su dueño, o al formulario, o al siguiente bloque.
  const target = (cta?.destination && ctx.blocks.some((b) => b.key === cta.destination) ? cta.destination : null) ?? ctx.blocks.find((b) => b.type === 'formulario')?.key ?? ctx.blocks[ctx.blocks.findIndex((b) => b.key === block.key) + 1]?.key;
  return (
    <button
      type="button"
      onClick={() => {
        ctx.onCtaClick(block);
        if (target) ctx.scrollTo(target);
      }}
      className={BUTTON}
      style={buttonStyle(theme)}
    >
      {label}
    </button>
  );
}

const REQUIRED = 'Este campo es obligatorio.';

/** Lo que se le dice a quien no pudo enviar el formulario, según lo que respondió el servidor. */
function submitProblem(err: unknown, fields: FormField[]): { fields: Record<string, string>; form?: string } {
  if (err instanceof ApiError && err.status === 422) {
    const mapped: Record<string, string> = {};
    let general: string | undefined;
    for (const [path, message] of Object.entries(err.fieldErrors())) {
      const field = path === 'consent' ? 'consent' : fieldForIssuePath(path, fields);
      if (field) mapped[field] = message;
      else general ??= message;
    }
    return { fields: mapped, form: general ?? (Object.keys(mapped).length === 0 ? 'Revisa tus datos e inténtalo de nuevo.' : undefined) };
  }
  if (err instanceof ApiError && err.status === 429) return { fields: {}, form: 'Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.' };
  if (err instanceof ApiError && err.status === 404) return { fields: {}, form: 'Esta página ya no está disponible.' };
  return { fields: {}, form: 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.' };
}

/** El formulario de la página: valida al momento, manda el lead y explica cualquier problema junto a su campo. */
export function PublicForm({ block, theme, ctx }: { block: Block; theme: PageTheme; ctx: PublicContext }) {
  const fields = formFieldsOf(block.content);
  const base = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = typeof block.content.title === 'string' ? block.content.title : '';
  const submitLabel = typeof block.content.submitLabel === 'string' ? block.content.submitLabel : 'Enviar';
  const inputStyle: CSSProperties = { borderRadius: '8px', borderColor: `${theme.palette.secondary}55` };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    for (const field of fields) if (field.required && (values[field.name] ?? '').trim() === '') found[field.name] = REQUIRED;
    const body = buildLeadBody(fields, values, consent);
    let general: string | null = null;
    for (const issue of validateLead(body)) {
      const field = issue.path[0] === 'consent' ? 'consent' : fieldForIssuePath(issue.path.join('.'), fields);
      if (field) found[field] ??= issue.message;
      else general ??= issue.message;
    }
    setErrors(found);
    setFormError(general);
    if (Object.keys(found).length > 0 || general) return;

    setBusy(true);
    try {
      await ctx.submitLead(body);
    } catch (err) {
      const problem = submitProblem(err, fields);
      setErrors(problem.fields);
      setFormError(problem.form ?? null);
      setBusy(false);
    }
  }

  const describe = (name: string) => (errors[name] ? `${base}-${name}-error` : undefined);
  const control = 'mt-1 w-full border bg-white px-3 py-2 text-base text-neutral-900 outline-none focus:ring-2';

  return (
    <form onSubmit={submit} noValidate aria-label={title || 'Formulario'} className="mx-auto max-w-md text-left">
      {title && (
        <h2 className="text-2xl font-heading leading-tight" style={{ fontWeight: theme.look.headingWeight, textTransform: theme.look.headingTransform }}>
          {title}
        </h2>
      )}
      <div className="mt-5 space-y-3">
        {fields.map((field) => {
          const id = `${base}-${field.name}`;
          const common = {
            id,
            name: field.name,
            'aria-required': field.required || undefined,
            'aria-invalid': errors[field.name] ? true : undefined,
            'aria-describedby': describe(field.name),
            className: control,
            style: inputStyle,
            value: values[field.name] ?? '',
          };
          const set = (value: string) => {
            setValues((previous) => ({ ...previous, [field.name]: value }));
            setErrors((previous) => ({ ...previous, [field.name]: '' }));
          };
          return (
            <div key={field.name} className="text-sm">
              <label htmlFor={id} className="opacity-80">
                {field.label}
                {field.required ? ' *' : ''}
              </label>
              {field.type === 'textarea' ? (
                <textarea {...common} rows={4} onChange={(e) => set(e.target.value)} />
              ) : field.type === 'select' ? (
                <select {...common} onChange={(e) => set(e.target.value)}>
                  <option value="">Elige una opción</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input {...common} type={field.type} autoComplete={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : /^(nombre|name)/i.test(field.name) ? 'name' : 'off'} onChange={(e) => set(e.target.value)} />
              )}
              {errors[field.name] && (
                <p id={`${base}-${field.name}-error`} className="mt-1 text-xs font-medium" style={{ color: '#B42318' }}>
                  {errors[field.name]}
                </p>
              )}
            </div>
          );
        })}

        <div className="text-sm">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={consent}
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={describe('consent')}
              onChange={(e) => {
                setConsent(e.target.checked);
                setErrors((previous) => ({ ...previous, consent: '' }));
              }}
              className="mt-0.5 size-4"
            />
            <span className="opacity-80">Acepto que usen mis datos para contactarme.</span>
          </label>
          {errors.consent && (
            <p id={`${base}-consent-error`} className="mt-1 text-xs font-medium" style={{ color: '#B42318' }}>
              {errors.consent}
            </p>
          )}
        </div>
      </div>

      {formError && (
        <p role="alert" className="mt-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#B42318', color: '#B42318' }}>
          {formError}
        </p>
      )}

      <div className="mt-5 text-center">
        <button type="submit" disabled={busy} className={BUTTON} style={buttonStyle(theme)}>
          {busy ? 'Enviando…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Cuenta regresiva que avanza sola, cada segundo. */
export function LiveCountdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Date.parse(endsAt) - now);
  const parts: [number, string][] = [
    [Math.floor(remaining / 86_400_000), 'días'],
    [Math.floor(remaining / 3_600_000) % 24, 'horas'],
    [Math.floor(remaining / 60_000) % 60, 'min'],
    [Math.floor(remaining / 1000) % 60, 'seg'],
  ];
  return (
    <div role="timer" aria-label="Tiempo restante" className="mt-3 flex justify-center gap-3">
      {parts.map(([value, unit]) => (
        <div key={unit} className="min-w-16 rounded-lg px-3 py-2" style={{ background: '#00000012' }}>
          <p className="text-2xl font-bold tabular-nums">{String(value).padStart(2, '0')}</p>
          <p className="text-xs opacity-70">{unit}</p>
        </div>
      ))}
    </div>
  );
}
