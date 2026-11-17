import { Router, type Request, type RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import { getRequestId } from '../middleware/requestId.js';
import { generateBodySchema, regenerateBodySchema, regenerateParamsSchema } from '../schemas/ai.schemas.js';
import { funnelIdParamsSchema } from '../schemas/funnel.schemas.js';
import type { RequestContext } from '../services/auth.service.js';
import type { AiService } from '../services/ai.service.js';

function contextOf(req: Request, requestId: string): RequestContext {
  return { ip: req.ip, requestId };
}

/** Generación con IA sobre un funnel. Privado: `requireAuth` se declara una vez. Se monta en `/funnels`. */
export function createAiRouter(ai: AiService, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/:id/generate', async (req, res) => {
    const { id } = funnelIdParamsSchema.parse(req.params);
    const body = generateBodySchema.parse(req.body ?? {});
    res.json(await ai.generate(getAuth(res).userId, id, body, contextOf(req, getRequestId(res))));
  });

  router.post('/:id/content/blocks/:key/regenerate', async (req, res) => {
    const { id, key } = regenerateParamsSchema.parse(req.params);
    const body = regenerateBodySchema.parse(req.body ?? {});
    res.json(await ai.regenerateBlock(getAuth(res).userId, id, key, body, contextOf(req, getRequestId(res))));
  });

  return router;
}
