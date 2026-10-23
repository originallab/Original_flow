import { Check, Clock, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { PublicButtonLink } from '@/features/pageRenderer/public';
import { readableOn, type PageTheme } from '@/features/pageRenderer/theme';
import type { OrderView, PublicPage } from '@/services/publicPages';
import { navigation } from '@/shared/utils/navigation';
import { safeHttpUrl } from '@/shared/utils/safeUrl';
import { REDIRECT_DELAY_MS } from './constants';

interface Props {
  page: PublicPage;
  order: OrderView;
  theme: PageTheme;
  /** Ya se dejó de preguntar solo si se confirmó el pago: la persona puede revisar a mano. */
  stoppedPolling: boolean;
  checking: boolean;
  onRecheck: () => void;
}

/** A dónde volvió la persona después de pagar: pago recibido, todavía confirmándose o no completado. Con los colores de la página. */
export function OrderResult({ page, order, theme, stoppedPolling, checking, onRecheck }: Props) {
  const redirectUrl = order.status === 'paid' ? safeHttpUrl(order.redirectUrl) : null;
  useEffect(() => {
    if (!redirectUrl) return;
    const timer = setTimeout(() => navigation.to(redirectUrl), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [redirectUrl]);

  const paid = order.status === 'paid';
  const pending = order.status === 'pending';
  const Icon = paid ? Check : pending ? Clock : XCircle;
  const title = paid ? '¡Pago recibido!' : pending ? 'Estamos confirmando tu pago…' : 'El pago no se completó';
  const message = paid ? (order.message ?? 'Gracias por tu compra.') : pending ? (stoppedPolling ? 'Tu pago todavía no se confirma. Puede tardar unos minutos.' : 'No cierres esta página: se actualiza sola.') : 'No se completó la compra. Puedes intentarlo de nuevo.';

  return (
    <div className="grid min-h-screen place-items-center px-6 py-12" style={{ background: theme.palette.background, color: theme.palette.text }}>
      <main role="status" aria-live="polite" className="w-full max-w-md text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full" style={{ background: theme.palette.accent, color: readableOn(theme.palette.accent, theme.palette) }}>
          <Icon size={26} aria-hidden />
        </span>
        <h1 className="mt-5 text-3xl font-heading leading-tight" style={{ fontWeight: theme.look.headingWeight, textTransform: theme.look.headingTransform }}>
          {title}
        </h1>
        <p className="mt-3 whitespace-pre-line text-base opacity-90">{message}</p>
        <p className="mt-1 text-sm opacity-70">{page.name}</p>

        <div className="mt-6 flex flex-col items-center gap-3">
          {pending && stoppedPolling && (
            <button type="button" onClick={onRecheck} disabled={checking} className="inline-block px-6 py-3 text-sm font-semibold disabled:opacity-60" style={{ background: theme.palette.primary, color: readableOn(theme.palette.primary, theme.palette), borderRadius: theme.look.radius }}>
              {checking ? 'Revisando…' : 'Revisar de nuevo'}
            </button>
          )}
          {!paid && !pending && (
            <a href={`/p/${page.slug}`} className="inline-block px-6 py-3 text-sm font-semibold" style={{ background: theme.palette.primary, color: readableOn(theme.palette.primary, theme.palette), borderRadius: theme.look.radius }}>
              Volver a intentar
            </a>
          )}
          {redirectUrl && (
            <>
              <p className="text-sm opacity-70">Te llevamos al siguiente paso en unos segundos…</p>
              <PublicButtonLink theme={theme} href={redirectUrl}>
                Continuar ahora
              </PublicButtonLink>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
