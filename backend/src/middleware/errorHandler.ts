import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, type ErrorBody } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { getRequestId } from './requestId.js';

function send(res: Response, status: number, code: string, message: string, details: unknown = {}): void {
  const body: ErrorBody = { success: false, error: { code, message, details }, requestId: getRequestId(res) };
  res.status(status).json(body);
}

/** Responde 404 con el formato de error de la API para cualquier ruta no definida. */
export function notFoundHandler(_req: Request, res: Response): void {
  send(res, 404, 'NOT_FOUND', 'Recurso no encontrado');
}

/**
 * Convierte cualquier error en la respuesta estándar. Un error inesperado
 * responde 500 con un mensaje genérico: el detalle va al log, nunca al cliente.
 */
export function errorHandler(logger: Logger) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (res.headersSent) {
      logger.error('error después de enviar la respuesta', { requestId: getRequestId(res) });
      return;
    }

    if (err instanceof AppError) {
      send(res, err.status, err.code, err.message, err.details);
      return;
    }

    if (err instanceof ZodError) {
      const details = err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
      send(res, 422, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', details);
      return;
    }

    // Errores del lector de JSON de Express (cuerpo mal formado o demasiado grande).
    const bodyError = err as { type?: string; status?: number } | null;
    if (bodyError?.type === 'entity.parse.failed') {
      send(res, 400, 'INVALID_JSON', 'El cuerpo de la petición no es un JSON válido');
      return;
    }
    if (bodyError?.type === 'entity.too.large') {
      send(res, 413, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la petición es demasiado grande');
      return;
    }

    logger.error('error no controlado', {
      requestId: getRequestId(res),
      error: err instanceof Error ? err.message : 'desconocido',
      stack: err instanceof Error ? err.stack : undefined,
    });
    send(res, 500, 'INTERNAL_ERROR', 'Ocurrió un error interno');
  };
}
