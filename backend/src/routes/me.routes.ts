import { Router, type RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import type { MeService } from '../services/me.service.js';

/** Rutas del usuario autenticado. La autenticación se declara una vez para todo el router. */
export function createMeRouter(me: MeService, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (_req, res) => {
    res.json(await me.getMe(getAuth(res).userId));
  });

  return router;
}
