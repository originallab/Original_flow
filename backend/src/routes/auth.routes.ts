import { Router, type Request, type RequestHandler } from 'express';
import { getRequestId } from '../middleware/requestId.js';
import { callbackBodySchema, sessionParamsSchema, validateBodySchema } from '../schemas/auth.schemas.js';
import type { AuthService, RequestContext } from '../services/auth.service.js';

function contextOf(req: Request, requestId: string): RequestContext {
  return { ip: req.ip, requestId };
}

/**
 * Rutas públicas de autenticación (flujo de Original Auth). No piden sesión:
 * son las que la crean y la validan.
 */
export function createAuthRouter(auth: AuthService, sessionRateLimit: RequestHandler): Router {
  const router = Router();

  router.get('/session', sessionRateLimit, async (_req, res) => {
    res.json(await auth.createSession());
  });

  router.post('/callback', async (req, res) => {
    const body = callbackBodySchema.parse(req.body);
    res.json(await auth.handleCallback(body, contextOf(req, getRequestId(res))));
  });

  router.post('/validate', async (req, res) => {
    const { session } = validateBodySchema.parse(req.body);
    res.json(await auth.validate(session));
  });

  router.delete('/session/:token', async (req, res) => {
    const { token } = sessionParamsSchema.parse(req.params);
    await auth.logout(token, contextOf(req, getRequestId(res)));
    res.status(204).end();
  });

  return router;
}
