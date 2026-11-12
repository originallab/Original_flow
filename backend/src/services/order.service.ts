import type { OrderStatus } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import { pageToSkipTake, toPage, type Page } from '../lib/pagination.js';
import type { OrderListRecord, OrderModel } from '../models/order.model.js';
import type { ListOrdersQuery } from '../schemas/order.schemas.js';
import type { AccessService } from './access.service.js';
import { assertCan } from './permissions.js';

/** Una orden como la ve quien administra el negocio: monto como número y con el nombre de su funnel y de su lead. */
export interface OrderDto {
  id: string;
  funnelId: string;
  funnelName: string;
  leadId: string | null;
  leadName: string | null;
  orderNumber: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  paymentMethod: string | null;
  customerEmail: string;
  paidAt: Date | null;
  createdAt: Date;
}

export function toOrderDto({ funnel, lead, amount, ...order }: OrderListRecord): OrderDto {
  return { ...order, funnelName: funnel.name, leadName: lead?.name ?? null, amount: amount.toNumber() };
}

interface Deps {
  orders: OrderModel;
  access: AccessService;
}

/**
 * Las ventas de un negocio (solo lectura). Una orden de otro cliente responde 404 (nunca 403). El correo del
 * comprador solo sale aquí, para quien tiene permiso; nunca en los logs ni en la auditoría.
 */
export function createOrderService({ orders, access }: Deps) {
  return {
    /** GET /orders: la lista del negocio, de la más nueva a la más vieja, con filtros y paginación. */
    async list(userId: string, query: ListOrdersQuery): Promise<Page<OrderDto>> {
      const resolved = await access.resolve(userId, query.workspaceId);
      if (!resolved) throw AppError.notFound('WORKSPACE_NOT_FOUND', 'Workspace no encontrado');
      assertCan(resolved.role, 'order:read');
      const { workspaceId, funnelId, status } = query;
      const { items, total } = await orders.list({ workspaceId, funnelId, status }, pageToSkipTake(query));
      return toPage(items.map(toOrderDto), total, query);
    },

    /** GET /orders/:id */
    async get(userId: string, orderId: string): Promise<OrderDto> {
      const order = await orders.findById(orderId);
      const resolved = order ? await access.resolve(userId, order.funnel.workspaceId) : null;
      if (!order || !resolved) throw AppError.notFound('ORDER_NOT_FOUND', 'Orden no encontrada');
      assertCan(resolved.role, 'order:read');
      return toOrderDto(order);
    },
  };
}

export type OrderService = ReturnType<typeof createOrderService>;
