import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import type { OperationLogService } from '../../services/operationLog.service.js';
import { signRequest } from './signing.js';
import type { MediaContext, MediaStore, MediaUploadInput, StoredMedia } from './types.js';

interface Deps {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  timeoutMs?: number;
  logger: Logger;
  operationLog: OperationLogService;
  fetchFn?: typeof fetch;
  now?: () => number;
}

/** Sin respuesta (red, tiempo agotado) o un 5xx. */
class TransientError extends Error {}

const uploadResponse = z.object({
  file_id: z.number().int(),
  s3_key: z.string().min(1),
  is_public: z.boolean().optional(),
  public_url: z.string().nullable().optional(),
});

/**
 * Cliente de MediaAAS (almacén de archivos de The Original Lab): firma HMAC-SHA256 en cada petición. Sube con
 * `POST /client/upload` (multipart) y borra con `DELETE /client/files/{id}`. Cada llamada queda en el log operativo;
 * ni las llaves ni los nombres de archivo se escriben en los logs.
 */
export function createMediaAasClient({ baseUrl, apiKey, secretKey, timeoutMs = 30_000, logger, operationLog, fetchFn = fetch, now = Date.now }: Deps): MediaStore {
  const root = baseUrl.replace(/\/+$/, '');

  async function call(method: 'POST' | 'DELETE', path: string, body?: FormData): Promise<unknown> {
    const timestamp = Math.floor(now() / 1000);
    let response: Response;
    try {
      response = await fetchFn(`${root}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'X-Api-Key': apiKey,
          'X-Timestamp': String(timestamp),
          // Multipart: el cuerpo no entra en la firma. DELETE no lleva cuerpo.
          'X-Signature': signRequest(secretKey, method, path, timestamp, body ? 'multipart' : new Uint8Array()),
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new TransientError('sin respuesta de MediaAAS');
    }
    if (response.status >= 500) throw new TransientError(`MediaAAS respondió ${response.status}`);
    if (response.status === 429) throw AppError.tooManyRequests('MEDIA_RATE_LIMITED', 'Demasiadas subidas; intenta más tarde');
    if (response.status === 401 || response.status === 403) {
      logger.warn('MediaAAS rechazó las credenciales de la app', { status: response.status });
      throw AppError.serviceUnavailable('MEDIA_MISCONFIGURED', 'No se pudo autenticar con el almacén de archivos; revisa las credenciales del servidor');
    }
    if (response.status === 404) throw AppError.notFound('MEDIA_NOT_FOUND', 'Archivo no encontrado');
    if (!response.ok) throw AppError.unprocessable('MEDIA_REJECTED', 'El almacén de archivos rechazó el archivo');
    return response.json().catch(() => ({}));
  }

  const track = <T>(ctx: MediaContext, operation: string, run: () => Promise<T>) =>
    operationLog.track(
      { requestId: ctx.requestId, service: 'media-aas', operation, workspaceId: ctx.workspaceId },
      async () => {
        try {
          return await run();
        } catch (err) {
          if (err instanceof TransientError) throw AppError.serviceUnavailable('MEDIA_UNAVAILABLE', 'El almacén de archivos no responde; intenta de nuevo');
          throw err;
        }
      },
      (err) => (err instanceof AppError ? err.code : 'UNKNOWN'),
    );

  return {
    upload: (ctx, input: MediaUploadInput): Promise<StoredMedia> =>
      track(ctx, 'upload', async () => {
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }), input.fileName);
        form.append('file_name', input.fileName);
        form.append('is_public', String(input.isPublic));
        const parsed = uploadResponse.safeParse(await call('POST', '/client/upload', form));
        if (!parsed.success) throw AppError.serviceUnavailable('MEDIA_BAD_RESPONSE', 'El almacén de archivos devolvió una respuesta inesperada');
        const publicPath = parsed.data.public_url;
        return { fileId: parsed.data.file_id, s3Key: parsed.data.s3_key, publicUrl: publicPath ? new URL(publicPath, `${root}/`).toString() : null };
      }),

    remove: (ctx, fileId) =>
      track(ctx, 'delete', async () => {
        await call('DELETE', `/client/files/${fileId}`);
      }),
  };
}
