import { Router, type RequestHandler } from 'express';
import { describeFunnelTypes } from '../funnel-types/index.js';

/** Catálogo de tipos de funnel. Cualquier persona autenticada puede consultarlo. */
export function createFunnelTypesRouter(requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', (_req, res) => {
    res.json({ items: describeFunnelTypes() });
  });

  return router;
}
