import { Router, type Request, type RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import { getRequestId } from '../middleware/requestId.js';
import { createStageBodySchema, stageIdParamsSchema, updateStageBodySchema } from '../schemas/lead.schemas.js';
import { idParamsSchema } from '../schemas/workspace.schemas.js';
import type { RequestContext } from '../services/auth.service.js';
import type { LeadStageService } from '../services/leadStage.service.js';

function contextOf(req: Request, requestId: string): RequestContext {
  return { ip: req.ip, requestId };
}

/**
 * Las etapas del tablero: unas cuelgan del negocio (`/workspaces/:id/lead-stages`) y otras se piden por su
 * id (`/lead-stages/:id`), así que este router se monta en la raíz de la API y cada ruta declara su
 * `requireAuth` (un `router.use` aquí pediría sesión a todo lo que no coincida con otro router).
 */
export function createLeadStagesRouter(stages: LeadStageService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get('/workspaces/:id/lead-stages', requireAuth, async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await stages.list(getAuth(res).userId, id));
  });

  router.post('/workspaces/:id/lead-stages', requireAuth, async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const body = createStageBodySchema.parse(req.body);
    res.status(201).json(await stages.create(getAuth(res).userId, id, body, contextOf(req, getRequestId(res))));
  });

  router.patch('/lead-stages/:id', requireAuth, async (req, res) => {
    const { id } = stageIdParamsSchema.parse(req.params);
    const body = updateStageBodySchema.parse(req.body);
    res.json(await stages.update(getAuth(res).userId, id, body, contextOf(req, getRequestId(res))));
  });

  router.delete('/lead-stages/:id', requireAuth, async (req, res) => {
    const { id } = stageIdParamsSchema.parse(req.params);
    await stages.remove(getAuth(res).userId, id, contextOf(req, getRequestId(res)));
    res.status(204).end();
  });

  return router;
}
