import { Router, type Request, type RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import { getRequestId } from '../middleware/requestId.js';
import {
  blockParamsSchema,
  contentBodySchema,
  createFunnelBodySchema,
  ctaParamsSchema,
  funnelIdParamsSchema,
  listFunnelsQuerySchema,
  patchBlockBodySchema,
  patchCtaBodySchema,
  typeConfigBodySchema,
  updateFunnelBodySchema,
} from '../schemas/funnel.schemas.js';
import type { RequestContext } from '../services/auth.service.js';
import type { FunnelService } from '../services/funnel.service.js';
import type { FunnelContentService } from '../services/funnelContent.service.js';
import type { FunnelPublishService } from '../services/funnelPublish.service.js';

function contextOf(req: Request, requestId: string): RequestContext {
  return { ip: req.ip, requestId };
}

/** Funnels, su contenido, ajustes por tipo y CTA. Privado: `requireAuth` se declara una vez. */
export function createFunnelsRouter(
  funnels: FunnelService,
  content: FunnelContentService,
  publishing: FunnelPublishService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const query = listFunnelsQuerySchema.parse(req.query);
    res.json(await funnels.list(getAuth(res).userId, query));
  });

  router.post('/', async (req, res) => {
    const body = createFunnelBodySchema.parse(req.body);
    res.status(201).json(await funnels.create(getAuth(res).userId, body, contextOf(req, getRequestId(res))));
  });

  router.get('/:id', async (req, res) => {
    const { id } = funnelIdParamsSchema.parse(req.params);
    res.json(await funnels.get(getAuth(res).userId, id));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = funnelIdParamsSchema.parse(req.params);
    const body = updateFunnelBodySchema.parse(req.body);
    res.json(await funnels.update(getAuth(res).userId, id, body, contextOf(req, getRequestId(res))));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = funnelIdParamsSchema.parse(req.params);
    await funnels.remove(getAuth(res).userId, id, contextOf(req, getRequestId(res)));
    res.status(204).end();
  });

  router.post('/:id/publish', async (req, res) => {
    const { id } = funnelIdParamsSchema.parse(req.params);
    res.json(await publishing.publish(getAuth(res).userId, id, contextOf(req, getRequestId(res))));
  });

  router.post('/:id/unpublish', async (req, res) => {
    const { id } = funnelIdParamsSchema.parse(req.params);
    res.json(await publishing.unpublish(getAuth(res).userId, id, contextOf(req, getRequestId(res))));
  });

  router.put('/:id/content', async (req, res) => {
    const { id } = funnelIdParamsSchema.parse(req.params);
    const body = contentBodySchema.parse(req.body);
    res.json(await content.putContent(getAuth(res).userId, id, body.blocks));
  });

  router.patch('/:id/content/blocks/:key', async (req, res) => {
    const { id, key } = blockParamsSchema.parse(req.params);
    const body = patchBlockBodySchema.parse(req.body);
    res.json(await content.patchBlock(getAuth(res).userId, id, key, body));
  });

  router.put('/:id/type-config', async (req, res) => {
    const { id } = funnelIdParamsSchema.parse(req.params);
    const body = typeConfigBodySchema.parse(req.body);
    res.json(await content.putTypeConfig(getAuth(res).userId, id, body, contextOf(req, getRequestId(res))));
  });

  router.get('/:id/ctas', async (req, res) => {
    const { id } = funnelIdParamsSchema.parse(req.params);
    res.json(await content.listCtas(getAuth(res).userId, id));
  });

  router.patch('/:id/ctas/:blockKey', async (req, res) => {
    const { id, blockKey } = ctaParamsSchema.parse(req.params);
    const body = patchCtaBodySchema.parse(req.body);
    res.json(await content.patchCta(getAuth(res).userId, id, blockKey, body, contextOf(req, getRequestId(res))));
  });

  return router;
}
