import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { testApp } from './helpers/testApp.js';

describe('GET /health', () => {
  it('responde 200 con status ok y un X-Request-Id', async () => {
    const res = await request(testApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toMatch(/^req_[0-9a-f]{12}$/);
  });

  it('envía los encabezados de seguridad y no revela Express', async () => {
    const res = await request(testApp()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('ignora un X-Request-Id enviado por el cliente', async () => {
    const res = await request(testApp()).get('/health').set('X-Request-Id', 'req_falso');
    expect(res.headers['x-request-id']).not.toBe('req_falso');
  });
});

describe('rutas inexistentes', () => {
  it('responden 404 con el formato de error de la API', async () => {
    const res = await request(testApp()).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND', message: expect.any(String) },
      requestId: res.headers['x-request-id'],
    });
  });
});

describe('cuerpo de la petición', () => {
  it('un JSON mal formado responde 400 INVALID_JSON', async () => {
    const res = await request(testApp())
      .post('/api/v1/cualquiera')
      .set('Content-Type', 'application/json')
      .send('{"roto":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('un cuerpo mayor al límite responde 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(testApp())
      .post('/api/v1/cualquiera')
      .send({ relleno: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('CORS', () => {
  it('permite un origen de la lista', async () => {
    const res = await request(testApp()).get('/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('no concede nada a un origen que no está en la lista', async () => {
    const res = await request(testApp()).get('/health').set('Origin', 'https://sitio-malicioso.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
