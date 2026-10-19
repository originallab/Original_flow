import { Router, type RequestHandler } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { FunnelService } from '../services/funnel.service.js';
import type { FunnelContentService } from '../services/funnelContent.service.js';
import type { FunnelPublishService } from '../services/funnelPublish.service.js';
import type { MeService } from '../services/me.service.js';
import type { PaymentsService } from '../services/payments.service.js';
import type { WorkspaceService } from '../services/workspace.service.js';
import { createAuthRouter } from './auth.routes.js';
import { createFunnelsRouter } from './funnels.routes.js';
import { createFunnelTypesRouter } from './funnelTypes.routes.js';
import { createMeRouter } from './me.routes.js';
import { createWorkspacesRouter } from './workspaces.routes.js';

interface ApiDeps {
  auth: AuthService;
  me: MeService;
  workspaces: WorkspaceService;
  payments: PaymentsService;
  funnels: FunnelService;
  funnelContent: FunnelContentService;
  funnelPublish: FunnelPublishService;
  requireAuth: RequestHandler;
  authSessionRateLimit: RequestHandler;
}

/**
 * Rutas de la API (se montan en /api/v1). Cada paso del orden de construcción
 * registra aquí su router. Los públicos van sin sesión; cada router privado
 * declara `requireAuth` una sola vez al principio.
 */
export function createApiRouter({ auth, me, workspaces, payments, funnels, funnelContent, funnelPublish, requireAuth, authSessionRateLimit }: ApiDeps): Router {
  const api = Router();
  api.use('/auth', createAuthRouter(auth, authSessionRateLimit));
  api.use('/me', createMeRouter(me, requireAuth));
  api.use('/workspaces', createWorkspacesRouter(workspaces, payments, requireAuth));
  api.use('/funnel-types', createFunnelTypesRouter(requireAuth));
  api.use('/funnels', createFunnelsRouter(funnels, funnelContent, funnelPublish, requireAuth));
  return api;
}
