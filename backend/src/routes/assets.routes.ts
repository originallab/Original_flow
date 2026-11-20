import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { getAuth } from '../middleware/requireAuth.js';
import { getRequestId } from '../middleware/requestId.js';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, type AssetService } from '../services/asset.service.js';

const workspaceQuery = z.object({ workspaceId: z.uuid() });
const assetParams = z.object({ id: z.uuid() });

/**
 * Las imágenes del negocio. La imagen viaja como binario directo en el cuerpo (con su `Content-Type`: PNG, JPG o WebP) y el
 * nombre en el encabezado `X-File-Name` (codificado con encodeURIComponent): así no hace falta una librería de multipart.
 * Privado: `requireAuth` se declara una vez.
 */
export function createAssetsRouter(assets: AssetService, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/', express.raw({ type: [...ALLOWED_IMAGE_TYPES], limit: MAX_IMAGE_BYTES }), async (req, res) => {
    const { workspaceId } = workspaceQuery.parse(req.query);
    // Si el tipo no es uno de los aceptados, el cuerpo no se leyó y no es un Buffer.
    if (!Buffer.isBuffer(req.body)) throw AppError.unprocessable('ASSET_TYPE_NOT_ALLOWED', 'Solo se aceptan imágenes PNG, JPG o WebP');
    const rawName = req.header('X-File-Name');
    let name: string | undefined;
    try {
      name = rawName ? decodeURIComponent(rawName) : undefined;
    } catch {
      name = undefined;
    }
    const mimeType = (req.header('Content-Type') ?? '').split(';')[0]?.trim() ?? '';
    res.status(201).json(await assets.upload(getAuth(res).userId, workspaceId, { bytes: req.body, mimeType, name }, { ip: req.ip, requestId: getRequestId(res) }));
  });

  router.get('/', async (req, res) => {
    const { workspaceId } = workspaceQuery.parse(req.query);
    res.json({ items: await assets.list(getAuth(res).userId, workspaceId) });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = assetParams.parse(req.params);
    await assets.remove(getAuth(res).userId, id, { ip: req.ip, requestId: getRequestId(res) });
    res.status(204).end();
  });

  return router;
}
