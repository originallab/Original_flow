import { randomBytes } from 'node:crypto';
import { getFunnelType } from '../funnel-types/index.js';
import { AppError } from '../lib/errors.js';
import { SLUG_PATTERN } from '../lib/slug.js';
import type { OriginalPayClient } from '../integrations/original-pay/client.js';
import type { Currency, PaymentMethod } from '../integrations/original-pay/types.js';
import type { FunnelModel } from '../models/funnel.model.js';
import type { LeadModel } from '../models/lead.model.js';
import type { OrderModel, OrderRecord } from '../models/order.model.js';
import type { CheckoutBody } from '../schemas/public.schemas.js';
import type { PaymentsService } from './payments.service.js';

interface Deps {
  funnels: FunnelModel;
  leads: LeadModel;
  orders: OrderModel;
  payments: PaymentsService;
  pay: OriginalPayClient;
}

export interface CheckoutResult {
  publicToken: string;
  status: 'pending' | 'paid' | 'cancelled' | 'failed';
  /** Solo cuando la orden está pendiente: a dónde mandar a la persona a pagar. */
  paymentUrl?: string;
  /** Solo con Stripe, y solo en esta respuesta: el navegador lo necesita para completar el cobro. No se guarda. */
  clientSecret?: string;
}

export interface OrderView {
  publicToken: string;
  /** La página donde se compró: la ruta fija de retorno la usa para llevar a la persona a su orden. */
  slug: string;
  status: OrderRecord['status'];
  /** Solo cuando ya está pagada. */
  message?: string;
  redirectUrl?: string;
}

const newOrderNumber = () => `OF-${randomBytes(6).toString('hex').toUpperCase()}`;

/**
 * Cobro dentro de la página pública. El monto sale siempre del precio del funnel en la base de datos
 * (nunca del navegador) y la llave de Original Pay es la del negocio, descifrada solo aquí.
 * Los datos del comprador no se escriben en los logs.
 */
export function createCheckoutService({ funnels, leads, orders, payments, pay }: Deps) {
  /** El estado autoritativo vive en Original Pay: si ya está pagada, se marca y se registra la conversión. */
  async function syncOrder(order: OrderRecord, requestId: string): Promise<OrderRecord> {
    if (order.status !== 'pending' || !order.opOrderToken) return order;
    const creds = await payments.credentialsFor(order.funnel.workspaceId);
    if (!creds) return order;
    const remote = await pay.getStatus({ requestId, workspaceId: order.funnel.workspaceId }, creds.apiKey, order.opOrderToken);
    if (remote.status === 'paid') {
      await orders.markPaid({ id: order.id, funnelId: order.funnelId, leadId: order.leadId, workspaceId: order.funnel.workspaceId, amount: order.amount });
    } else if (remote.status === 'cancelled') {
      await orders.closeIfPending(order.id, 'cancelled');
    } else {
      return order;
    }
    return (await orders.findByPublicToken(order.publicToken)) ?? order;
  }

  function viewOf(order: OrderRecord): OrderView {
    const view: OrderView = { publicToken: order.publicToken, slug: order.funnel.slug, status: order.status };
    if (order.status === 'paid') {
      const parsed = getFunnelType(order.funnel.objective).typeConfigSchema.safeParse(order.funnel.typeConfig);
      if (parsed.success) {
        const c = parsed.data as { successMessage?: string; successUrl?: string };
        if (c.successMessage) view.message = c.successMessage;
        if (c.successUrl) view.redirectUrl = c.successUrl;
      }
    }
    return view;
  }

  return {
    /** POST /public/funnels/:slug/checkout */
    async checkout(slug: string, body: CheckoutBody, options: { idempotencyKey?: string; requestId: string }): Promise<CheckoutResult> {
      const funnel = SLUG_PATTERN.test(slug) ? await funnels.findPublishedForCheckout(slug) : null;
      if (!funnel) throw AppError.notFound('PAGE_NOT_FOUND', 'Página no encontrada');
      const price = funnel.price === null ? 0 : Number(funnel.price);
      if (funnel.objective !== 'venta' || !(price > 0)) {
        throw AppError.unprocessable('FUNNEL_NOT_SELLABLE', 'Esta página no cobra');
      }

      // Reintentar con la misma clave nunca crea ni cobra una segunda orden.
      if (options.idempotencyKey) {
        const previous = await orders.findByIdempotencyKey(funnel.id, options.idempotencyKey);
        if (previous) return { publicToken: previous.publicToken, status: previous.status, ...(previous.status === 'pending' && previous.paymentUrl ? { paymentUrl: previous.paymentUrl } : {}) };
      }

      const creds = await payments.credentialsFor(funnel.workspaceId);
      if (!creds) throw AppError.unprocessable('PAYMENTS_NOT_CONNECTED', 'El negocio todavía no conectó Original Pay');
      const method = (body.paymentMethod ?? creds.methods[0]) as PaymentMethod;
      if (!creds.methods.includes(method)) {
        throw AppError.unprocessable('VALIDATION_ERROR', 'Los datos enviados no son válidos', [{ path: 'paymentMethod', message: 'el negocio no acepta este método de pago' }]);
      }

      // El lead: el que ya existe con ese correo o uno nuevo en la primera etapa del tablero.
      let leadId = (await leads.findByEmail(funnel.id, body.email))?.id;
      if (!leadId) {
        const stageId = await leads.firstStageId(funnel.workspaceId);
        if (!stageId) throw AppError.unprocessable('PIPELINE_NOT_CONFIGURED', 'El negocio todavía no tiene etapas de seguimiento configuradas');
        leadId = await leads.createWithEvent(
          { funnelId: funnel.id, leadStageId: stageId, name: body.name, email: body.email, phone: body.phone, utm: body.utm, customFields: { _consentAt: new Date().toISOString() } },
          body.utm.utm_source ? { source: body.utm.utm_source } : {},
        );
      }

      if (await orders.hasPaid(funnel.id, leadId)) throw AppError.conflict('ORDER_ALREADY_PAID', 'Esta compra ya está pagada');

      let order = await orders.findPendingOfLead(funnel.id, leadId);
      if (!order) {
        order = await orders.create({
          funnelId: funnel.id,
          leadId,
          orderNumber: newOrderNumber(),
          amount: price,
          currency: funnel.currency,
          customerEmail: body.email,
          idempotencyKey: options.idempotencyKey,
        });
        await orders.recordEvent(funnel.id, leadId, 'checkout_started', { orderId: order.id });
      }

      const ctx = { requestId: options.requestId, workspaceId: funnel.workspaceId };
      // Si ya está despachada (volvió a pulsar pagar), se consulta el estado antes de despachar otra vez.
      if (order.opOrderToken) {
        order = await syncOrder(order, options.requestId);
        if (order.status !== 'pending') return { publicToken: order.publicToken, status: order.status };
        if (order.paymentUrl && order.paymentMethod === method) return { publicToken: order.publicToken, status: 'pending', paymentUrl: order.paymentUrl };
      }

      const { orderToken } = await pay.initPayment(ctx, creds.apiKey, {
        amount: price,
        currency: funnel.currency as Currency,
        orderNumber: order.orderNumber,
        productCode: funnel.slug,
        description: funnel.name,
        customerEmail: body.email,
      });
      const processed = await pay.processPayment(ctx, creds.apiKey, { orderToken, paymentMethod: method });
      const saved = await orders.setPaymentInfo(order.id, { opOrderToken: orderToken, paymentMethod: method, paymentUrl: processed.paymentUrl });
      return {
        publicToken: saved.publicToken,
        status: 'pending',
        ...(processed.paymentUrl ? { paymentUrl: processed.paymentUrl } : {}),
        ...(processed.clientSecret ? { clientSecret: processed.clientSecret } : {}),
      };
    },

    /** GET /public/orders/:publicToken: el estado de la orden; si sigue pendiente, se consulta a Original Pay. */
    async getOrder(publicToken: string, requestId: string): Promise<OrderView> {
      const order = await orders.findByPublicToken(publicToken);
      if (!order) throw AppError.notFound('ORDER_NOT_FOUND', 'Orden no encontrada');
      return viewOf(await syncOrder(order, requestId));
    },
  };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
