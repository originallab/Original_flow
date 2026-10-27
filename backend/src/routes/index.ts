import { Router, type RequestHandler } from 'express';
import type { AnalyticsService } from '../services/analytics.service.js';
import type { AuthService } from '../services/auth.service.js';
import type { FunnelService } from '../services/funnel.service.js';
import type { FunnelContentService } from '../services/funnelContent.service.js';
import type { FunnelHistoryService } from '../services/funnelHistory.service.js';
import type { FunnelPublishService } from '../services/funnelPublish.service.js';
import type { MeService } from '../services/me.service.js';
import type { WorkspaceService } from '../services/workspace.service.js';
import { createAnalyticsRouter } from './analytics.routes.js';
import { createAuthRouter } from './auth.routes.js';
import { createFunnelsRouter } from './funnels.routes.js';
import { createFunnelTypesRouter } from './funnelTypes.routes.js';
import { createMeRouter } from './me.routes.js';
import { createWorkspacesRouter } from './workspaces.routes.js';

interface ApiDeps {
  auth: AuthService;
  me: MeService;
  workspaces: WorkspaceService;
  funnels: FunnelService;
  funnelContent: FunnelContentService;
  funnelPublish: FunnelPublishService;
  funnelHistory: FunnelHistoryService;
  analytics: AnalyticsService;
  requireAuth: RequestHandler;
  authSessionRateLimit: RequestHandler;
}

/**
 * Rutas de la API (se montan en /api/v1). Cada paso del orden de construcción
 * registra aquí su router. Los públicos van sin sesión; cada router privado
 * declara `requireAuth` una sola vez al principio.
 */
export function createApiRouter({ auth, me, workspaces, funnels, funnelContent, funnelPublish, funnelHistory, analytics, requireAuth, authSessionRateLimit }: ApiDeps): Router {
  const api = Router();
  api.use('/auth', createAuthRouter(auth, authSessionRateLimit));
  api.use('/me', createMeRouter(me, requireAuth));
  api.use('/workspaces', createWorkspacesRouter(workspaces, requireAuth));
  api.use('/funnel-types', createFunnelTypesRouter(requireAuth));
  api.use('/funnels', createFunnelsRouter(funnels, funnelContent, funnelPublish, funnelHistory, requireAuth));
  api.use('/analytics', createAnalyticsRouter(analytics, requireAuth));
  return api;
}
