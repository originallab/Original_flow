import { Router, type Request, type RequestHandler } from 'express';
import { paginationQuerySchema } from '../lib/pagination.js';
import { getAuth } from '../middleware/requireAuth.js';
import { getRequestId } from '../middleware/requestId.js';
import {
  createWorkspaceBodySchema,
  idParamsSchema,
  inviteMemberBodySchema,
  memberParamsSchema,
  updateWorkspaceBodySchema,
} from '../schemas/workspace.schemas.js';
import type { RequestContext } from '../services/auth.service.js';
import type { WorkspaceService } from '../services/workspace.service.js';

function contextOf(req: Request, requestId: string): RequestContext {
  return { ip: req.ip, requestId };
}

/** Workspaces y su equipo. Privado: la autenticación se declara una vez para todo el router. */
export function createWorkspacesRouter(workspaces: WorkspaceService, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const query = paginationQuerySchema.parse(req.query);
    res.json(await workspaces.list(getAuth(res).userId, query));
  });

  router.post('/', async (req, res) => {
    const body = createWorkspaceBodySchema.parse(req.body);
    res.status(201).json(await workspaces.create(getAuth(res).userId, body, contextOf(req, getRequestId(res))));
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await workspaces.get(getAuth(res).userId, id));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const body = updateWorkspaceBodySchema.parse(req.body);
    res.json(await workspaces.update(getAuth(res).userId, id, body, contextOf(req, getRequestId(res))));
  });

  router.get('/:id/members', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const query = paginationQuerySchema.parse(req.query);
    res.json(await workspaces.listMembers(getAuth(res).userId, id, query));
  });

  router.post('/:id/members', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const body = inviteMemberBodySchema.parse(req.body);
    res.status(201).json(await workspaces.invite(getAuth(res).userId, id, body, contextOf(req, getRequestId(res))));
  });

  router.delete('/:id/members/:memberId', async (req, res) => {
    const { id, memberId } = memberParamsSchema.parse(req.params);
    await workspaces.removeMember(getAuth(res).userId, id, memberId, contextOf(req, getRequestId(res)));
    res.status(204).end();
  });

  return router;
}
