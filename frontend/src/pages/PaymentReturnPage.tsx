import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { recallOrder } from '@/features/publicPage/lastOrder';
import { ApiError } from '@/services/api';
import { getOrder } from '@/services/publicPages';
import { Button } from '@/shared/ui/Button';

/** Los nombres con los que Original Pay puede devolver el token de la orden en la dirección. */
const TOKEN_PARAMS = ['order', 'order_token', 'token'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type State = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'go'; to: string };

function Message({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-bg px-6 text-center text-text">{children}</main>;
}

/**
 * Dirección fija a la que Original Pay devuelve a quien pagó (`/pago/retorno`, `/pago/exito` y `/pago/error`:
 * las tres hacen lo mismo, porque el estado real de la compra siempre lo confirma el servidor). Busca el token
 * de la orden —el que venga en la dirección o, si no, el que se recordó al salir a pagar— y lleva a la persona a
 * `/p/:slug/orden/:token`, que espera la confirmación y muestra el resultado.
 */
export function PaymentReturnPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const fromUrl = TOKEN_PARAMS.map((name) => params.get(name)).find((value) => value && UUID.test(value));
    const token = fromUrl ?? recallOrder();
    if (!token || !UUID.test(token)) {
      setState({ status: 'missing' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    getOrder(token, controller.signal)
      .then((order) => {
        if (controller.signal.aborted) return;
        setState(order.slug ? { status: 'go', to: `/p/${encodeURIComponent(order.slug)}/orden/${encodeURIComponent(order.publicToken)}` } : { status: 'missing' });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: err instanceof ApiError && err.status === 404 ? 'missing' : 'error' });
      });
    return () => controller.abort();
  }, [params, attempt]);

  if (state.status === 'go') return <Navigate to={state.to} replace />;
  if (state.status === 'missing') {
    return (
      <Message>
        <p role="alert">No encontramos tu compra. Si ya pagaste, tu pago se confirmará solo; revisa tu correo o vuelve a la página.</p>
      </Message>
    );
  }
  if (state.status === 'error') {
    return (
      <Message>
        <div>
          <p role="alert">No se pudo consultar tu compra.</p>
          <Button className="mt-4" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      </Message>
    );
  }
  return (
    <Message>
      <p role="status">Confirmando tu pago…</p>
    </Message>
  );
}
