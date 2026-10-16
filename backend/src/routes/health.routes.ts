import { Router } from 'express';

/**
 * Endpoint de salud para el HEALTHCHECK del contenedor (EasyPanel).
 * Más adelante comprobará también la conexión a la base de datos.
 */
export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
