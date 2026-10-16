import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../src/lib/errors.js';
import { createLogger } from '../src/lib/logger.js';
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler.js';
import { requestId } from '../src/middleware/requestId.js';

/** App mínima con rutas de prueba que lanzan distintos errores. */
function appQueFalla() {
  const app = express();
  app.use(requestId);
  app.get('/app-error', () => {
    throw AppError.conflict('SLUG_TAKEN', 'El slug ya está en uso', { slug: 'mi-curso' });
  });
  app.get('/zod', () => {
    z.object({ email: z.email() }).parse({ email: 'no-es-correo' });
  });
  app.get('/inesperado', () => {
    throw new Error('contraseña de la base: secreto123');
  });
  app.get('/async', async () => {
    throw AppError.notFound();
  });
  app.use(notFoundHandler);
  app.use(errorHandler(createLogger('silent')));
  return app;
}

describe('errorHandler', () => {
  it('convierte un AppError en su estado, código y detalles', async () => {
    const res = await request(appQueFalla()).get('/app-error');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'SLUG_TAKEN', message: 'El slug ya está en uso', details: { slug: 'mi-curso' } },
      requestId: res.headers['x-request-id'],
    });
  });

  it('convierte un error de Zod en 422 con la lista de campos', async () => {
    const res = await request(appQueFalla()).get('/zod');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ path: 'email', message: expect.any(String) }]);
  });

  it('un error inesperado responde 500 genérico sin filtrar su mensaje', async () => {
    const res = await request(appQueFalla()).get('/inesperado');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secreto123');
  });

  it('captura los errores lanzados en handlers asíncronos (Express 5)', async () => {
    const res = await request(appQueFalla()).get('/async');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
