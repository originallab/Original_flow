import { Router, type RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import { analyticsQuerySchema, dropOffQuerySchema } from '../schemas/analytics.schemas.js';
import type { AnalyticsService } from '../services/analytics.service.js';

/** La analítica del dashboard. Privado: `requireAuth` se declara una vez. */
export function createAnalyticsRouter(analytics: AnalyticsService, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/summary', async (req, res) => {
    res.json(await analytics.summary(getAuth(res).userId, analyticsQuerySchema.parse(req.query)));
  });

  router.get('/funnel-conversion', async (req, res) => {
    res.json(await analytics.funnelConversion(getAuth(res).userId, analyticsQuerySchema.parse(req.query)));
  });

  router.get('/sources', async (req, res) => {
    res.json(await analytics.sources(getAuth(res).userId, analyticsQuerySchema.parse(req.query)));
  });

  router.get('/drop-off', async (req, res) => {
    res.json(await analytics.dropOff(getAuth(res).userId, dropOffQuerySchema.parse(req.query)));
  });

  router.get('/funnels', async (req, res) => {
    res.json(await analytics.funnels(getAuth(res).userId, analyticsQuerySchema.parse(req.query)));
  });

  return router;
}
