import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/lib/logger.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { createRateLimit } from '../src/middleware/rateLimit.js';
import { requestId } from '../src/middleware/requestId.js';

function appConLimite(max: number, reloj: { ahora: number }) {
  const app = express();
  app.use(requestId);
  app.get('/limitada', createRateLimit({ max, windowMs: 60_000, now: () => reloj.ahora }), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler(createLogger('silent')));
  return app;
}

describe('createRateLimit', () => {
  it('permite hasta el máximo y después responde 429 con Retry-After', async () => {
    const reloj = { ahora: 1_000_000 };
    const app = appConLimite(2, reloj);
    expect((await request(app).get('/limitada')).status).toBe(200);
    expect((await request(app).get('/limitada')).status).toBe(200);
    const bloqueada = await request(app).get('/limitada');
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.error.code).toBe('RATE_LIMITED');
    expect(Number(bloqueada.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('vuelve a permitir cuando termina la ventana', async () => {
    const reloj = { ahora: 1_000_000 };
    const app = appConLimite(1, reloj);
    await request(app).get('/limitada');
    expect((await request(app).get('/limitada')).status).toBe(429);
    reloj.ahora += 60_001;
    expect((await request(app).get('/limitada')).status).toBe(200);
  });
});
