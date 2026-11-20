import { describe, expect, it } from 'vitest';
import { createMediaAasClient } from '../src/integrations/media-aas/client.js';
import { createLogger } from '../src/lib/logger.js';
import { createOperationLogService } from '../src/services/operationLog.service.js';

/**
 * Prueba de humo contra Media-as-a-Service DE VERDAD: sube una imagen mínima pública, comprueba que se puede ver sin firma
 * y la borra. Solo corre si se pasan las llaves por el entorno (MEDIAAS_LIVE_API_KEY y MEDIAAS_LIVE_SECRET_KEY); nunca sola ni en CI.
 */
const apiKey = process.env.MEDIAAS_LIVE_API_KEY;
const secretKey = process.env.MEDIAAS_LIVE_SECRET_KEY;
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

describe.skipIf(!apiKey || !secretKey)('MediaAAS real (prueba de humo opcional)', () => {
  const logger = createLogger('silent');
  const client = createMediaAasClient({
    baseUrl: process.env.MEDIAAS_LIVE_BASE_URL ?? 'https://getfile.media-as-a-service.io',
    apiKey: apiKey as string,
    secretKey: secretKey as string,
    logger,
    operationLog: createOperationLogService({ create: async () => undefined }, logger),
  });
  const ctx = { requestId: 'req_prueba_en_vivo' };

  it('sube una imagen pública, se ve sin firma y se borra', async () => {
    const stored = await client.upload(ctx, { bytes: PNG, fileName: 'prueba-original-flow.png', mimeType: 'image/png', isPublic: true });
    try {
      expect(stored.fileId).toBeGreaterThan(0);
      expect(stored.publicUrl).toMatch(/^https:\/\//);
      const res = await fetch(stored.publicUrl as string);
      console.log('SUBIDA OK:', JSON.stringify({ fileId: stored.fileId, publicUrl: stored.publicUrl, vista: res.status, tipo: res.headers.get('content-type') }));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/^image\//);
    } finally {
      await client.remove(ctx, stored.fileId);
    }
  }, 60_000);
});
