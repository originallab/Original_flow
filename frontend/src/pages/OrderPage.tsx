import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { resolveTheme } from '@/features/pageRenderer/theme';
import { MAX_ORDER_POLLS, ORDER_POLL_MS } from '@/features/publicPage/checkoutConstants';
import { OrderResult } from '@/features/publicPage/OrderResult';
import { useSeo } from '@/features/publicPage/useSeo';
import { ApiError } from '@/services/api';
import { getOrder, getPublicPage, type OrderView, type PublicPage } from '@/services/publicPages';
import { Button } from '@/shared/ui/Button';

type State = { status: 'loading' } | { status: 'notfound' } | { status: 'error' } | { status: 'ready'; page: PublicPage; order: OrderView };

/** Mensaje neutro (sin logotipo de la plataforma: la página es del cliente). */
function Message({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-bg px-6 text-center text-text">{children}</main>;
}

/**
 * La página a la que vuelve quien pagó (`/p/:slug/orden/:publicToken`): mientras la orden sigue pendiente
 * pregunta sola cada pocos segundos si se confirmó el pago, y al confirmarse muestra el mensaje de la compra.
 */
export function OrderPage() {
  const { slug = '', token = '' } = useParams();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [polls, setPolls] = useState(0);
  const [checking, setChecking] = useState(false);
  const alive = useRef(true);
  const page = state.status === 'ready' ? state.page : null;
  const order = state.status === 'ready' ? state.order : null;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    setPolls(0);
    Promise.all([getPublicPage(slug, controller.signal), getOrder(token, controller.signal)])
      .then(([loadedPage, loadedOrder]) => !controller.signal.aborted && setState({ status: 'ready', page: loadedPage, order: loadedOrder }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: err instanceof ApiError && err.status === 404 ? 'notfound' : 'error' });
      });
    return () => controller.abort();
  }, [slug, token, attempt]);

  useSeo(page);

  const refresh = useCallback(async () => {
    try {
      const fresh = await getOrder(token);
      if (alive.current) setState((previous) => (previous.status === 'ready' ? { ...previous, order: fresh } : previous));
    } catch {
      // Se vuelve a intentar en la próxima ronda o a mano.
    }
  }, [token]);

  // Mientras siga pendiente, se pregunta cada ORDER_POLL_MS hasta MAX_ORDER_POLLS veces.
  const pending = order?.status === 'pending';
  useEffect(() => {
    if (!pending || polls >= MAX_ORDER_POLLS) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      void refresh();
    }, ORDER_POLL_MS);
    return () => clearTimeout(timer);
  }, [pending, polls, refresh]);

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
          <h1 className="font-heading text-2xl font-semibold">No encontramos esta compra</h1>
          <p className="mt-2 text-sm text-text-2">Revisa que la dirección esté completa.</p>
        </div>
      </Message>
    );
  }
  if (state.status === 'error' || !page || !order) {
    return (
      <Message>
        <div>
          <p role="alert">No se pudo cargar tu compra.</p>
          <Button className="mt-4" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      </Message>
    );
  }

  return (
    <OrderResult
      page={page}
      order={order}
      theme={resolveTheme(page.designSpec)}
      stoppedPolling={polls >= MAX_ORDER_POLLS}
      checking={checking}
      onRecheck={() => {
        setChecking(true);
        void refresh().finally(() => alive.current && setChecking(false));
      }}
    />
  );
}
