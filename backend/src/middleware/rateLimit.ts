import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

interface Options {
  /** Peticiones permitidas por ventana y por IP. */
  max: number;
  windowMs?: number;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
}

/** Tope de IPs recordadas a la vez; evita que un ataque con muchas IPs llene la memoria. */
const MAX_TRACKED = 10_000;

/**
 * Límite de peticiones por IP, en memoria de un solo proceso (sin Redis: hay una
 * instancia). Si el despliegue pasa a varias instancias, hay que cambiarlo por un
 * contador compartido. No tiene dependencias externas, así que no puede "fallar":
 * cuando se agota el cupo responde 429.
 */
export function createRateLimit({ max, windowMs = 60_000, now = Date.now }: Options) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  function sweep(current: number): void {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= current) hits.delete(key);
    }
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const current = now();
    if (hits.size >= MAX_TRACKED) sweep(current);

    const key = req.ip ?? 'ip-desconocida';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= current) {
      entry = { count: 0, resetAt: current + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - current) / 1000))));
      next(AppError.tooManyRequests());
      return;
    }
    next();
  };
}
