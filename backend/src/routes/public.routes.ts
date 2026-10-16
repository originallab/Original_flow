import { Router, type RequestHandler } from 'express';
import { eventsBodySchema, leadBodySchema, slugParamsSchema } from '../schemas/public.schemas.js';
import type { PublicCaptureService } from '../services/publicCapture.service.js';
import type { PublicPageService } from '../services/publicPage.service.js';

/**
 * Rutas públicas (las usa el visitante de una página publicada). No llevan sesión y tienen
 * su propia política de CORS y su propio límite de peticiones (ver app.ts). El funnel se
 * identifica por su slug, nunca por un id enviado en el cuerpo.
 */
export function createPublicRouter(pages: PublicPageService, capture: PublicCaptureService, leadsRateLimit: RequestHandler): Router {
  const router = Router();

  router.get('/pages/:slug', async (req, res) => {
    res.json(await pages.getPage(slugParamsSchema.parse(req.params).slug));
  });

  router.post('/funnels/:slug/leads', leadsRateLimit, async (req, res) => {
    const { slug } = slugParamsSchema.parse(req.params);
    const body = leadBodySchema.parse(req.body);
    res.status(201).json(await capture.captureLead(slug, body));
  });

  router.post('/funnels/:slug/events', async (req, res) => {
    const { slug } = slugParamsSchema.parse(req.params);
    const body = eventsBodySchema.parse(req.body);
    res.status(202).json(await capture.recordEvents(slug, body));
  });

  return router;
}
