import { apiFetch } from './api';
import type { Currency } from './funnels';
import type { OrderStatus } from './publicPages';

/** Solo para el modo demostración: lo que necesita la «pasarela» de mentira (`/demo/pago/:token`) para simular Original Pay. */

export interface DemoPayOrder {
  slug: string;
  name: string;
  amount: number;
  currency: Currency;
  status: OrderStatus;
}

export function getDemoPayOrder(publicToken: string): Promise<DemoPayOrder> {
  return apiFetch(`/public/_demo/orders/${encodeURIComponent(publicToken)}`);
}

/** Simula el resultado del pago: la orden queda pagada o fallida. */
export function payDemoOrder(publicToken: string, outcome: 'paid' | 'failed'): Promise<{ status: OrderStatus; slug: string }> {
  return apiFetch(`/public/_demo/orders/${encodeURIComponent(publicToken)}/pay`, { method: 'POST', body: { outcome } });
}
