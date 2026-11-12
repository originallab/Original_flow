import { z } from 'zod';
import { paginationQuerySchema } from '../lib/pagination.js';

export const orderIdParamsSchema = z.object({ id: z.uuid() });

export const ORDER_STATUSES = ['pending', 'paid', 'cancelled', 'failed'] as const;

/** GET /orders: el negocio y filtros opcionales por funnel y estado. */
export const listOrdersQuerySchema = paginationQuerySchema.extend({
  workspaceId: z.uuid(),
  funnelId: z.uuid().optional(),
  status: z.enum(ORDER_STATUSES).optional(),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
