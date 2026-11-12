import type { OrderStatus, Prisma, PrismaClient } from '../generated/prisma/client.js';

export interface NewOrder {
  funnelId: string;
  leadId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  customerEmail: string;
  idempotencyKey?: string;
}

/** Lo que el servicio necesita de una orden, con el funnel (para el slug, el mensaje de éxito y el negocio). */
const FIELDS = {
  id: true,
  publicToken: true,
  funnelId: true,
  leadId: true,
  orderNumber: true,
  amount: true,
  currency: true,
  status: true,
  paymentMethod: true,
  customerEmail: true,
  paymentUrl: true,
  paidAt: true,
  createdAt: true,
  funnel: { select: { slug: true, workspaceId: true, objective: true, typeConfig: true } },
} satisfies Prisma.OrderSelect;

export type OrderRecord = Prisma.OrderGetPayload<{ select: typeof FIELDS }>;

/** Lo que ve quien administra el negocio en la lista de ventas: sin el token público ni la dirección de pago. */
const LIST_FIELDS = {
  id: true,
  funnelId: true,
  leadId: true,
  orderNumber: true,
  amount: true,
  currency: true,
  status: true,
  paymentMethod: true,
  customerEmail: true,
  paidAt: true,
  createdAt: true,
  funnel: { select: { name: true, workspaceId: true } },
  lead: { select: { name: true } },
} satisfies Prisma.OrderSelect;

export type OrderListRecord = Prisma.OrderGetPayload<{ select: typeof LIST_FIELDS }>;

export interface OrderFilter {
  workspaceId: string;
  funnelId?: string;
  status?: OrderStatus;
}

/** Acceso a datos de `Order`. */
export function createOrderModel(prisma: PrismaClient) {
  return {
    findByPublicToken(publicToken: string): Promise<OrderRecord | null> {
      return prisma.order.findUnique({ where: { publicToken }, select: FIELDS });
    },

    /** La orden con ese número (el que Original Pay devuelve en su aviso de pago). */
    findByOrderNumber(orderNumber: string): Promise<OrderRecord | null> {
      return prisma.order.findUnique({ where: { orderNumber }, select: FIELDS });
    },

    findByIdempotencyKey(funnelId: string, idempotencyKey: string): Promise<OrderRecord | null> {
      return prisma.order.findUnique({ where: { funnelId_idempotencyKey: { funnelId, idempotencyKey } }, select: FIELDS });
    },

    /** La orden pendiente más reciente de ese lead en ese funnel (para no crear otra si vuelve a pulsar pagar). */
    findPendingOfLead(funnelId: string, leadId: string): Promise<OrderRecord | null> {
      return prisma.order.findFirst({ where: { funnelId, leadId, status: 'pending' }, orderBy: { createdAt: 'desc' }, select: FIELDS });
    },

    /** ¿Ya pagó este lead en este funnel? */
    async hasPaid(funnelId: string, leadId: string): Promise<boolean> {
      return (await prisma.order.count({ where: { funnelId, leadId, status: 'paid' } })) > 0;
    },

    create(order: NewOrder): Promise<OrderRecord> {
      return prisma.order.create({ data: order, select: FIELDS });
    },

    /** Guarda a dónde mandar a la persona a pagar (lo que devolvió Original Pay) y el método que eligió, si lo eligió. */
    setPaymentInfo(id: string, info: { paymentUrl: string; paymentMethod?: string }): Promise<OrderRecord> {
      return prisma.order.update({
        where: { id },
        data: { paymentUrl: info.paymentUrl, ...(info.paymentMethod ? { paymentMethod: info.paymentMethod } : {}) },
        select: FIELDS,
      });
    },

    /**
     * Marca la orden como pagada, mueve el lead a la etapa «ganado» (si el negocio tiene una) y registra
     * `payment_completed`, todo en una transacción. Devuelve false si otra petición ya la había marcado
     * (así el evento nunca se duplica).
     */
    markPaid(order: {
      id: string;
      funnelId: string;
      leadId: string | null;
      workspaceId: string;
      amount: Prisma.Decimal | number | string;
      paymentMethod?: string;
    }): Promise<boolean> {
      return prisma.$transaction(async (tx) => {
        const { count } = await tx.order.updateMany({
          where: { id: order.id, status: { not: 'paid' } },
          data: { status: 'paid', paidAt: new Date(), ...(order.paymentMethod ? { paymentMethod: order.paymentMethod } : {}) },
        });
        if (count === 0) return false;
        if (order.leadId) {
          const won = await tx.leadStage.findFirst({ where: { workspaceId: order.workspaceId, isWon: true }, orderBy: { order: 'asc' }, select: { id: true } });
          await tx.lead.update({ where: { id: order.leadId }, data: { value: order.amount, ...(won ? { leadStageId: won.id } : {}) } });
        }
        await tx.event.create({
          data: { funnelId: order.funnelId, leadId: order.leadId, type: 'payment_completed', properties: { amount: Number(order.amount) } },
        });
        return true;
      });
    },

    /** Las órdenes de un negocio, de la más nueva a la más vieja, con filtros y paginación. */
    async list(filter: OrderFilter, paging: { skip: number; take: number }): Promise<{ items: OrderListRecord[]; total: number }> {
      const where: Prisma.OrderWhereInput = {
        funnel: { workspaceId: filter.workspaceId },
        ...(filter.funnelId ? { funnelId: filter.funnelId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.order.findMany({ where, select: LIST_FIELDS, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...paging }),
        prisma.order.count({ where }),
      ]);
      return { items, total };
    },

    findById(id: string): Promise<OrderListRecord | null> {
      return prisma.order.findUnique({ where: { id }, select: LIST_FIELDS });
    },

    /** Registra un evento del servidor (por ejemplo `checkout_started`). */
    async recordEvent(funnelId: string, leadId: string | null, type: string, properties: Prisma.InputJsonValue = {}): Promise<void> {
      await prisma.event.create({ data: { funnelId, leadId, type, properties } });
    },
  };
}

export type OrderModel = ReturnType<typeof createOrderModel>;
