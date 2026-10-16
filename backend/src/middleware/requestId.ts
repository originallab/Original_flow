import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Asigna un identificador a cada petición. Se genera siempre en el servidor
 * (nunca se confía en uno enviado por el cliente) y se devuelve en el
 * encabezado `X-Request-Id` y en cualquier respuesta de error.
 */
export function requestId(_req: Request, res: Response, next: NextFunction): void {
  const id = `req_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export function getRequestId(res: Response): string {
  return typeof res.locals.requestId === 'string' ? res.locals.requestId : 'req_unknown';
}
