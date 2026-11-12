import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { PageRenderer } from '@/features/pageRenderer/PageRenderer';
import type { PublicContext } from '@/features/pageRenderer/public';
import { resolveTheme } from '@/features/pageRenderer/theme';
import { readUtm, trafficSource } from '@/features/publicPage/traffic';
import { rememberOrder } from '@/features/publicPage/lastOrder';
import { CheckoutDialog } from '@/features/publicPage/CheckoutDialog';
import { ThankYou } from '@/features/publicPage/ThankYou';
import { useSeo } from '@/features/publicPage/useSeo';
import { useTracker } from '@/features/publicPage/useTracker';
import { ApiError } from '@/services/api';
import { getPublicPage, sendLead, startCheckout, type PublicPage as Page } from '@/services/publicPages';
import type { AfterSubmit } from '@/shared/afterSubmit';
import type { CheckoutBody } from '@/shared/payments';
import { Button } from '@/shared/ui/Button';
import { navigation } from '@/shared/utils/navigation';
import { safeHttpUrl } from '@/shared/utils/safeUrl';

type State = { status: 'loading' } | { status: 'notfound' } | { status: 'error' } | { status: 'ready'; page: Page };

/** Mensaje neutro (sin logotipo de la plataforma: la página publicada es del cliente, no de Original Flow). */
function Message({ children }: { children: ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-bg px-6 text-center text-text">{children}</main>;
}

/**
 * La página publicada de un funnel (`/p/:slug`): la ve el visitante, sin sesión y con la marca del
 * cliente. Dibuja la página con todo funcionando (formulario, botones, cuenta regresiva), mide la
 * visita, las secciones vistas y los clics, y al registrarse muestra la pantalla de agradecimiento.
 */
export function PublicPage() {
  const { slug = '' } = useParams();
  const { search } = useLocation();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState<{ next: AfterSubmit | null } | null>(null);
  const [buying, setBuying] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const page = state.status === 'ready' ? state.page : null;

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    setDone(null);
    setBuying(false);
    getPublicPage(slug, controller.signal)
      .then((loaded) => !controller.signal.aborted && setState({ status: 'ready', page: loaded }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: err instanceof ApiError && err.status === 404 ? 'notfound' : 'error' });
      });
    return () => controller.abort();
  }, [slug, attempt]);

  useSeo(page);
  const tracker = useTracker(slug, Boolean(page));
  const { pageView, sectionView } = tracker;

  // La visita, con su origen.
  useEffect(() => {
    if (page) pageView(trafficSource(search, document.referrer, window.location.hostname));
  }, [page, pageView, search]);

  // Cada sección que entra en pantalla (una sola vez por visita).
  useEffect(() => {
    if (!page || !root.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.blockKey;
          if (entry.isIntersecting && key) sectionView(key);
        }
      },
      { threshold: 0.4 },
    );
    root.current.querySelectorAll('[data-block-key]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [page, done, sectionView]);

  const context = useMemo<PublicContext | undefined>(() => {
    if (!page) return undefined;
    const utm = readUtm(search, document.referrer);
    return {
      ctas: page.ctas,
      blocks: [...page.content.blocks].sort((a, b) => a.order - b.order),
      onCtaClick: (block) => tracker.buttonClick(block.key),
      scrollTo: (key) => root.current?.querySelector(`[data-block-key="${key}"]`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
      submitLead: async (body) => {
        const response = await sendLead(slug, { ...body, utm });
        setDone({ next: response.next });
        window.scrollTo?.({ top: 0 });
      },
      price: page.price,
      openCheckout: () => setBuying(true),
    };
    // `tracker` cambia de identidad solo cuando cambia la página; los demás datos salen de `page`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, slug, search, tracker.buttonClick]);

  if (state.status === 'loading') {
    return (
      <Message>
        <p role="status" className="text-sm text-text-2">
          Cargando…
        </p>
      </Message>
    );
  }
  if (state.status === 'notfound') {
    return (
      <Message>
        <div>
          <h1 className="font-heading text-2xl font-semibold">Esta página no está disponible</h1>
          <p className="mt-2 text-sm text-text-2">Puede que ya no esté publicada o que la dirección esté mal escrita.</p>
        </div>
      </Message>
    );
  }
  if (state.status === 'error' || !page) {
    return (
      <Message>
        <div>
          <p role="alert">No se pudo cargar la página.</p>
          <Button className="mt-4" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      </Message>
    );
  }

  const theme = resolveTheme(page.designSpec);
  if (done) return <ThankYou page={page} next={done.next} theme={theme} />;

  // Crea la orden y lleva a la persona a pagar. Un enlace de pago que no sea http o https no se abre.
  async function submitCheckout(body: CheckoutBody, idempotencyKey: string) {
    const utm = readUtm(search, document.referrer);
    const response = await startCheckout(slug, { ...body, utm }, idempotencyKey);
    const url = safeHttpUrl(response.paymentUrl);
    if (!url) throw new ApiError(0, 'INVALID_PAYMENT_URL', 'No se pudo abrir el pago');
    // Original Pay devuelve a una dirección fija: se recuerda la orden para encontrarla al volver.
    rememberOrder(response.publicToken);
    navigation.to(url);
  }

  return (
    <div ref={root} className="min-h-screen overflow-x-hidden" style={{ background: theme.palette.background, color: theme.palette.text }}>
      <main className="mx-auto max-w-3xl">
        <PageRenderer blocks={page.content.blocks} design={page.designSpec} currency={page.currency} mode="public" publicContext={context} />
      </main>
      {buying && <CheckoutDialog page={page} theme={theme} onSubmit={submitCheckout} onClose={() => setBuying(false)} />}
    </div>
  );
}
