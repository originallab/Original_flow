import { Router, type Request, type RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import { getRequestId } from '../middleware/requestId.js';
import { createLeadBodySchema, leadIdParamsSchema, listLeadsQuerySchema, updateLeadBodySchema } from '../schemas/lead.schemas.js';
import type { RequestContext } from '../services/auth.service.js';
import type { LeadService } from '../services/lead.service.js';

function contextOf(req: Request, requestId: string): RequestContext {
  return { ip: req.ip, requestId };
}

/** Los leads del tablero. Privado: `requireAuth` se declara una vez. */
export function createLeadsRouter(leads: LeadService, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    res.json(await leads.list(getAuth(res).userId, listLeadsQuerySchema.parse(req.query)));
  });

  router.post('/', async (req, res) => {
    const body = createLeadBodySchema.parse(req.body);
    res.status(201).json(await leads.create(getAuth(res).userId, body, contextOf(req, getRequestId(res))));
  });

  router.get('/:id', async (req, res) => {
    const { id } = leadIdParamsSchema.parse(req.params);
    res.json(await leads.get(getAuth(res).userId, id));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = leadIdParamsSchema.parse(req.params);
    const body = updateLeadBodySchema.parse(req.body);
    res.json(await leads.update(getAuth(res).userId, id, body, contextOf(req, getRequestId(res))));
  });

  return router;
}
