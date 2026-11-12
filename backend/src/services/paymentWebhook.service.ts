import { createHash, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../config/index.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { OrderModel } from '../models/order.model.js';
import type { PaymentWebhookBody } from '../schemas/webhooks.schemas.js';

interface Deps {
  config: AppConfig;
  logger: Logger;
  orders: OrderModel;
}

/** Compara sin filtrar, por el tiempo que tarda, cuántos caracteres coinciden. */
function sameSecret(received: string, expected: string): boolean {
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Aviso de pago de Original Pay. Es la única forma de confirmar un pago: autentica con `token_app` y
 * `secret_key`, busca la orden por `order_number` y aplica el estado. Es idempotente: recibir dos veces el
 * mismo aviso no duplica la venta. Un pago rechazado o cancelado deja la orden pendiente para poder reintentar.
 */
export function createPaymentWebhookService({ config, logger, orders }: Deps) {
  return {
    async handle(body: PaymentWebhookBody): Promise<{ received: true }> {
      const { tokenApp, secretKey } = config.originalPay;
      if (!tokenApp || !secretKey) {
        throw AppError.serviceUnavailable('PAYMENTS_NOT_CONFIGURED', 'El servidor no tiene configuradas las credenciales de Original Pay');
      }
      if (!sameSecret(body.token_app, tokenApp) || !sameSecret(body.secret_key, secretKey)) {
        logger.warn('aviso de pago con credenciales inválidas');
        throw AppError.unauthorized('INVALID_CREDENTIALS', 'Credenciales inválidas');
      }

      const order = await orders.findByOrderNumber(body.order_number);
      if (!order) {
        logger.warn('aviso de pago de una orden desconocida', { orderNumber: body.order_number });
        throw AppError.notFound('ORDER_NOT_FOUND', 'Orden no encontrada');
      }

      if (body.payment_status === 'approved') {
        // Nunca se da por pagada una orden con otro monto o divisa que los de la orden.
        if (Math.abs(body.amount - Number(order.amount)) > 0.009 || body.currency !== order.currency) {
          logger.error('el aviso de pago no coincide con la orden', { orderNumber: order.orderNumber });
          throw AppError.conflict('PAYMENT_AMOUNT_MISMATCH', 'El monto o la divisa no coinciden con la orden');
        }
        await orders.markPaid({
          id: order.id,
          funnelId: order.funnelId,
          leadId: order.leadId,
          workspaceId: order.funnel.workspaceId,
          amount: order.amount,
          paymentMethod: body.payment_method,
        });
      } else if (body.payment_status !== 'pending' && order.status === 'pending') {
        // Rechazado o cancelado: la orden sigue pendiente (se puede reintentar) y queda constancia.
        await orders.recordEvent(order.funnelId, order.leadId, 'payment_failed', { status: body.payment_status });
      }
      return { received: true };
    },
  };
}

export type PaymentWebhookService = ReturnType<typeof createPaymentWebhookService>;
