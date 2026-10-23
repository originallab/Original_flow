import type { PaymentsConnection } from '@/shared/payments';
import { apiFetch } from './api';

/** Si el negocio tiene Original Pay conectado (`GET /workspaces/:id/payments`). La llave nunca se devuelve. */
export interface PaymentsStatus {
  connected: boolean;
  provider?: 'original_pay';
  currency?: PaymentsConnection['currency'];
  methods?: PaymentsConnection['methods'];
}

/** GET /workspaces/:id/payments (solo super admin y administrador). */
export function getPaymentsStatus(token: string, workspaceId: string, signal?: AbortSignal): Promise<PaymentsStatus> {
  return apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}/payments`, { token, signal });
}

/** PUT /workspaces/:id/payments: conecta Original Pay con la llave del negocio, su divisa y sus formas de pago. */
export function connectPayments(token: string, workspaceId: string, body: PaymentsConnection): Promise<PaymentsStatus> {
  return apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}/payments`, { method: 'PUT', body, token });
}
