import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { parseBearer } from '../schemas/auth.schemas.js';
import type { AuthContext, AuthService } from '../services/auth.service.js';

/**
 * Exige `Authorization: Bearer <session>` con una sesión validada y vigente.
 * Cada router privado lo declara una sola vez al principio (`router.use(...)`),
 * así un endpoint nuevo queda protegido sin acordarse de agregarle nada.
 */
export function createRequireAuth(auth: AuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = parseBearer(req.header('authorization'));
    const context = token ? await auth.resolveSession(token) : null;
    if (!context) {
      next(AppError.unauthorized());
      return;
    }
    res.locals.auth = context;
    next();
  };
}

/** La sesión de la petición, ya autenticada por `requireAuth`. */
export function getAuth(res: Response): AuthContext {
  const context = res.locals.auth as AuthContext | undefined;
  if (!context) throw AppError.unauthorized();
  return context;
}
