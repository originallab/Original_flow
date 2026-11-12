import { Router, type RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import { listOrdersQuerySchema, orderIdParamsSchema } from '../schemas/order.schemas.js';
import type { OrderService } from '../services/order.service.js';

/** Las ventas del negocio (solo lectura). Privado: `requireAuth` se declara una vez. */
export function createOrdersRouter(orders: OrderService, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    res.json(await orders.list(getAuth(res).userId, listOrdersQuerySchema.parse(req.query)));
  });

  router.get('/:id', async (req, res) => {
    const { id } = orderIdParamsSchema.parse(req.params);
    res.json(await orders.get(getAuth(res).userId, id));
  });

  return router;
}
