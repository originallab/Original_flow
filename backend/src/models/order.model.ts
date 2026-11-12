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
  opOrderToken: true,
  customerEmail: true,
  paymentUrl: true,
  paidAt: true,
  createdAt: true,
  funnel: { select: { slug: true, workspaceId: true, objective: true, typeConfig: true } },
} satisfies Prisma.OrderSelect;

export type OrderRecord = Prisma.OrderGetPayload<{ select: typeof FIELDS }>;

/** Acceso a datos de `Order`. */
export function createOrderModel(prisma: PrismaClient) {
  return {
    findByPublicToken(publicToken: string): Promise<OrderRecord | null> {
      return prisma.order.findUnique({ where: { publicToken }, select: FIELDS });
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

    /** Guarda lo que devolvió Original Pay al despachar el cobro. */
    setPaymentInfo(id: string, info: { opOrderToken: string; paymentMethod: string; paymentUrl?: string }): Promise<OrderRecord> {
      return prisma.order.update({ where: { id }, data: { opOrderToken: info.opOrderToken, paymentMethod: info.paymentMethod, paymentUrl: info.paymentUrl ?? null }, select: FIELDS });
    },

    /** Órdenes pendientes con orden en Original Pay, entre dos edades, para la reconciliación. */
    findPendingBetween(olderThan: Date, newerThan: Date, take: number): Promise<OrderRecord[]> {
      return prisma.order.findMany({
        where: { status: 'pending', opOrderToken: { not: null }, createdAt: { lte: olderThan, gte: newerThan } },
        orderBy: { createdAt: 'asc' },
        take,
        select: FIELDS,
      });
    },

    /** Orden cancelada o fallida: solo cambia el estado si sigue pendiente. */
    async closeIfPending(id: string, status: Extract<OrderStatus, 'cancelled' | 'failed'>): Promise<boolean> {
      const { count } = await prisma.order.updateMany({ where: { id, status: 'pending' }, data: { status } });
      return count === 1;
    },

    /**
     * Marca la orden como pagada, mueve el lead a la etapa «ganado» (si el negocio tiene una) y registra
     * `payment_completed`, todo en una transacción. Devuelve false si otra petición ya la había marcado
     * (así el evento nunca se duplica).
     */
    markPaid(order: { id: string; funnelId: string; leadId: string | null; workspaceId: string; amount: Prisma.Decimal | number | string }): Promise<boolean> {
      return prisma.$transaction(async (tx) => {
        const { count } = await tx.order.updateMany({ where: { id: order.id, status: { not: 'paid' } }, data: { status: 'paid', paidAt: new Date() } });
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

    /** Registra un evento del servidor (por ejemplo `checkout_started`). */
    async recordEvent(funnelId: string, leadId: string | null, type: string, properties: Prisma.InputJsonValue = {}): Promise<void> {
      await prisma.event.create({ data: { funnelId, leadId, type, properties } });
    },
  };
}

export type OrderModel = ReturnType<typeof createOrderModel>;
