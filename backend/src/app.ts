import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/index.js';
import type { Logger } from './lib/logger.js';
import { createAnalyticsModel } from './models/analytics.model.js';
import { createAuditLogModel } from './models/auditLog.model.js';
import { createCtaModel } from './models/cta.model.js';
import { createEventModel } from './models/event.model.js';
import { createFunnelModel } from './models/funnel.model.js';
import { createFunnelHistoryModel } from './models/funnelHistory.model.js';
import { createLeadModel } from './models/lead.model.js';
import { createLeadStageModel } from './models/leadStage.model.js';
import { createMembershipModel } from './models/membership.model.js';
import type { PrismaClient } from './models/prisma.js';
import { createSessionModel } from './models/session.model.js';
import { createUserModel } from './models/user.model.js';
import { createWorkspaceModel } from './models/workspace.model.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimit } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createRequireAuth } from './middleware/requireAuth.js';
import { healthRouter } from './routes/health.routes.js';
import { createApiRouter } from './routes/index.js';
import { createPublicRouter } from './routes/public.routes.js';
import { createAnalyticsService } from './services/analytics.service.js';
import { createAccessService } from './services/access.service.js';
import { createAuditService } from './services/audit.service.js';
import { createAuthService } from './services/auth.service.js';
import { createFunnelService } from './services/funnel.service.js';
import { createFunnelContentService } from './services/funnelContent.service.js';
import { createFunnelHistoryService } from './services/funnelHistory.service.js';
import { createFunnelPublishService } from './services/funnelPublish.service.js';
import { createPublicCaptureService } from './services/publicCapture.service.js';
import { createPublicPageService } from './services/publicPage.service.js';
import { createLeadService } from './services/lead.service.js';
import { createLeadStageService } from './services/leadStage.service.js';
import { createMeService } from './services/me.service.js';
import { createPaymentsService } from './services/payments.service.js';
import { createOriginalPayClient } from './integrations/original-pay/client.js';
import { createOperationLogModel } from './models/operationLog.model.js';
import { createOrderModel } from './models/order.model.js';
import { createCheckoutService } from './services/checkout.service.js';
import { createOperationLogService } from './services/operationLog.service.js';
import { createWorkspaceService } from './services/workspace.service.js';

/** Tamaño máximo del cuerpo JSON. Las subidas de archivos usarán su propia ruta. */
const JSON_BODY_LIMIT = '100kb';

/**
 * Arma la aplicación: crea los modelos, los servicios y las rutas y los conecta.
 * Es el único lugar donde se instancian las dependencias.
 */
export function createApp(config: AppConfig, logger: Logger, prisma: PrismaClient, overrides: { fetchFn?: typeof fetch } = {}): Express {
  const sessions = createSessionModel(prisma);
  const users = createUserModel(prisma);
  const memberships = createMembershipModel(prisma);
  const audit = createAuditService(createAuditLogModel(prisma), logger);
  const workspaceModel = createWorkspaceModel(prisma);

  const auth = createAuthService({ config, logger, sessions, users, memberships, audit });
  const me = createMeService(users, memberships);
  const access = createAccessService(workspaceModel, memberships);
  const workspaces = createWorkspaceService({ workspaces: workspaceModel, memberships, users, access, audit });
  const payments = createPaymentsService({ config, logger, workspaces: workspaceModel, access, audit });
  const funnelModel = createFunnelModel(prisma);
  const funnels = createFunnelService({ funnels: funnelModel, access, audit });
  const ctaModel = createCtaModel(prisma);
  const funnelContent = createFunnelContentService({ funnels: funnelModel, ctas: ctaModel, funnelService: funnels, audit });
  const funnelPublish = createFunnelPublishService({ funnels: funnelModel, ctas: ctaModel, workspaces: workspaceModel, funnelService: funnels, audit });
  const funnelHistory = createFunnelHistoryService({ funnels: funnelModel, history: createFunnelHistoryModel(prisma), funnelService: funnels, audit });
  const analytics = createAnalyticsService({ analytics: createAnalyticsModel(prisma), funnels: funnelModel, access });
  const leadModel = createLeadModel(prisma);
  const leadStageModel = createLeadStageModel(prisma);
  const leads = createLeadService({ leads: leadModel, stages: leadStageModel, access, audit });
  const leadStages = createLeadStageService({ stages: leadStageModel, access, audit });
  const publicPages = createPublicPageService(funnelModel);
  const publicCapture = createPublicCaptureService({ funnels: funnelModel, leads: leadModel, events: createEventModel(prisma) });
  const pay = createOriginalPayClient({ baseUrl: config.originalPay.baseUrl, logger, operationLog: createOperationLogService(createOperationLogModel(prisma), logger), fetchFn: overrides.fetchFn, sleep: overrides.fetchFn ? async () => {} : undefined });
  const checkout = createCheckoutService({ funnels: funnelModel, leads: leadModel, orders: createOrderModel(prisma), payments, pay });
  const requireAuth = createRequireAuth(auth);
  const authSessionRateLimit = createRateLimit({ max: config.rateLimit.authSessionPerMinute });

  const app = express();
  if (config.trustProxyHops > 0) app.set('trust proxy', config.trustProxyHops);

  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // Rutas públicas (páginas publicadas): su propia política de CORS, más acotada que la de
  // la plataforma, y su propio límite de peticiones. Van ANTES del CORS global; si no, el
  // CORS de la plataforma contestaría primero los preflight de las páginas con otros orígenes.
  app.use(
    '/api/v1/public',
    cors({ origin: config.publicCorsOrigins, methods: ['GET', 'POST'] }),
    createRateLimit({ max: config.rateLimit.publicPerMinute }),
    createPublicRouter(publicPages, publicCapture, checkout, createRateLimit({ max: config.rateLimit.leadsPerMinute })),
  );

  // Lista explícita de orígenes; nunca "*" junto con credenciales (playbook 03).
  app.use(cors({ origin: config.corsOrigins, credentials: true }));

  app.use(healthRouter);
  app.use('/api/v1', createApiRouter({ auth, me, workspaces, payments, funnels, funnelContent, funnelPublish, funnelHistory, analytics, leads, leadStages, requireAuth, authSessionRateLimit }));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
