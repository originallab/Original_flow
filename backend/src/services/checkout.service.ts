import { randomBytes } from 'node:crypto';
import { getFunnelType } from '../funnel-types/index.js';
import { AppError } from '../lib/errors.js';
import { SLUG_PATTERN } from '../lib/slug.js';
import type { OriginalPayClient } from '../integrations/original-pay/client.js';
import type { Currency } from '../integrations/original-pay/types.js';
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
 * (nunca del navegador) y las credenciales de Original Pay son las del servidor. El pago se confirma por
 * el aviso (webhook) de Original Pay: aquí solo se crea la orden y se manda a la persona a pagar.
 * Los datos del comprador no se escriben en los logs.
 */
export function createCheckoutService({ funnels, leads, orders, payments, pay }: Deps) {
  const resultOf = (order: OrderRecord): CheckoutResult => ({
    publicToken: order.publicToken,
    status: order.status,
    ...(order.status === 'pending' && order.paymentUrl ? { paymentUrl: order.paymentUrl } : {}),
  });

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
        if (previous) return resultOf(previous);
      }

      const settings = await payments.settingsFor(funnel.workspaceId);
      if (!settings) throw AppError.unprocessable('PAYMENTS_NOT_CONNECTED', 'El negocio todavía no habilitó Original Pay');
      if (body.paymentMethod && !settings.methods.includes(body.paymentMethod)) {
        throw AppError.unprocessable('VALIDATION_ERROR', 'Los datos enviados no son válidos', [
          { path: 'paymentMethod', message: 'el negocio no acepta este método de pago' },
        ]);
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
      // Si ya tiene dirección de pago (volvió a pulsar pagar), se reutiliza: no se crea otra orden en Original Pay.
      if (order.paymentUrl) return resultOf(order);

      const { paymentUrl } = await pay.initPayment(
        { requestId: options.requestId, workspaceId: funnel.workspaceId },
        {
          amount: price,
          currency: funnel.currency as Currency,
          orderNumber: order.orderNumber,
          productCode: funnel.slug,
          description: funnel.name,
          customerEmail: body.email,
        },
      );
      return resultOf(await orders.setPaymentInfo(order.id, { paymentUrl, paymentMethod: body.paymentMethod }));
    },

    /** GET /public/orders/:publicToken: el estado de la orden; lo actualiza el aviso de pago de Original Pay. */
    async getOrder(publicToken: string): Promise<OrderView> {
      const order = await orders.findByPublicToken(publicToken);
      if (!order) throw AppError.notFound('ORDER_NOT_FOUND', 'Orden no encontrada');
      return viewOf(order);
    },
  };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
