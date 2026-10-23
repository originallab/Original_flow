import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDemoPayOrder, payDemoOrder, type DemoPayOrder } from '@/services/demoPay';
import { isDemoMode } from '@/services/demo';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import { NotFoundPage } from './NotFoundPage';

const money = (order: DemoPayOrder) => new Intl.NumberFormat('es', { style: 'currency', currency: order.currency }).format(order.amount);

/**
 * La «pasarela» de mentira del modo demostración: hace de Original Pay para poder recorrer una compra
 * completa sin servidor. Nada se cobra; se elige si el pago sale bien o mal y se vuelve a la página.
 */
export function DemoPayPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<DemoPayOrder | null | 'error'>(null);
  const [busy, setBusy] = useState(false);
  const demo = import.meta.env.DEV && isDemoMode();

  useEffect(() => {
    if (!demo) return;
    getDemoPayOrder(token)
      .then(setOrder)
      .catch(() => setOrder('error'));
  }, [demo, token]);

  if (!demo) return <NotFoundPage />;

  async function pay(outcome: 'paid' | 'failed') {
    if (busy || !order || order === 'error') return;
    setBusy(true);
    try {
      const result = await payDemoOrder(token, outcome);
      navigate(`/p/${result.slug}/orden/${token}`);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <header className="flex h-16 items-center border-b border-border bg-surface px-6">
        <Logo />
      </header>
      <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-6 py-10">
        <div className="w-full rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Pasarela de pago de demostración</p>
          {order === null && (
            <p role="status" className="mt-4 text-sm text-text-2">
              Cargando…
            </p>
          )}
          {order === 'error' && <p role="alert" className="mt-4">No encontramos esta compra.</p>}
          {order && order !== 'error' && (
            <>
              <h1 className="mt-3 font-heading text-xl font-semibold">{order.name}</h1>
              <p className="mt-1 text-3xl font-semibold">{money(order)}</p>
              <p className="mt-3 text-sm text-text-2">Esto simula Original Pay: no se cobra nada. Elige cómo quieres que termine el pago.</p>
              <div className="mt-6 flex flex-col gap-2">
                <Button disabled={busy} onClick={() => void pay('paid')}>
                  Pagar
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void pay('failed')}>
                  Simular un pago fallido
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
