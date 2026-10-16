import type { Request, Response, NextFunction } from 'express';
import type { Logger } from '../lib/logger.js';
import { getRequestId } from './requestId.js';

/**
 * Registra una línea por petición al terminar. Se loguea el patrón de la ruta
 * (`/public/orders/:publicToken`), no la URL real, para no dejar tokens, ids
 * ni datos del visitante en los logs.
 */
export function requestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
      const route = req.route ? `${req.baseUrl}${String(req.route.path)}` : 'sin_ruta';
      logger.info('request', {
        requestId: getRequestId(res),
        method: req.method,
        route,
        status: res.statusCode,
        durationMs,
      });
    });
    next();
  };
}
