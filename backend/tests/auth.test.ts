import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './helpers/db.js';
import { crearSesion, cuerpoCallback, emailUnico, iniciarSesion } from './helpers/auth.js';
import { buildTestApp } from './helpers/testApp.js';

const MIN = 60_000;
const DIA = 24 * 60 * MIN;

describe.skipIf(!testDatabaseUrl)('autenticación con Original Auth', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const callback = (body: object) => request(app).post('/api/v1/auth/callback').send(body);
  const validar = (session: string) => request(app).post('/api/v1/auth/validate').send({ session });
  const envejecer = (token: string, ms: number) =>
    prisma.session.update({ where: { token }, data: { createdAt: new Date(Date.now() - ms) } });

  describe('GET /auth/session', () => {
    it('crea una sesión sin validar y devuelve su UUID', async () => {
      const res = await request(app).get('/api/v1/auth/session');
      expect(res.status).toBe(200);
      expect(res.body.session).toMatch(/^[0-9a-f-]{36}$/);
      const fila = await prisma.session.findUnique({ where: { token: res.body.session } });
      expect(fila).toMatchObject({ validated: false, userId: null });
    });
  });

  describe('POST /auth/callback y /auth/validate', () => {
    it('con secretos correctos crea el usuario, valida la sesión y /validate lo confirma', async () => {
      const session = await crearSesion(app);
      const body = cuerpoCallback(config, session);

      const res = await callback(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ validated: 1 });

      const confirmacion = await validar(session);
      expect(confirmacion.body).toMatchObject({ validated: 1, email: body.email, profileComplete: false });
      const usuario = await prisma.user.findUnique({ where: { email: body.email as string } });
      expect(usuario).toMatchObject({ name: 'Persona de Prueba' });
      expect(confirmacion.body.userId).toBe(usuario?.id);
    });

    it('/validate responde validated 0 mientras no haya callback', async () => {
      const session = await crearSesion(app);
      const res = await validar(session);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ validated: 0 });
    });

    it('con una secret_key incorrecta responde 200 con validated 0 y no crea nada', async () => {
      const session = await crearSesion(app);
      const body = cuerpoCallback(config, session, { secret_key: 'incorrecta' });
      const res = await callback(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ validated: 0 });
      expect(await prisma.user.findUnique({ where: { email: body.email as string } })).toBeNull();
      expect((await validar(session)).body).toEqual({ validated: 0 });
    });

    it('con un token_app incorrecto responde validated 0', async () => {
      const session = await crearSesion(app);
      const res = await callback(cuerpoCallback(config, session, { token_app: 'otra-app' }));
      expect(res.body).toEqual({ validated: 0 });
    });

    it('sin email responde 422', async () => {
      const session = await crearSesion(app);
      const { email: _omitido, ...sinEmail } = cuerpoCallback(config, session);
      const res = await callback(sinEmail);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('con una sesión que no se creó antes responde validated 0 y no crea el usuario', async () => {
      const body = cuerpoCallback(config, randomUUID());
      const res = await callback(body);
      expect(res.body).toEqual({ validated: 0 });
      expect(await prisma.user.findUnique({ where: { email: body.email as string } })).toBeNull();
    });

    it('es idempotente: repetir el callback no duplica usuario ni auditoría de registro', async () => {
      const session = await crearSesion(app);
      const body = cuerpoCallback(config, session);
      expect((await callback(body)).body).toEqual({ validated: 1 });
      expect((await callback(body)).body).toEqual({ validated: 1 });

      const usuarios = await prisma.user.findMany({ where: { email: body.email as string } });
      expect(usuarios).toHaveLength(1);
      const registros = await prisma.auditLog.count({ where: { action: 'auth.register', userId: usuarios[0]?.id } });
      expect(registros).toBe(1);
    });

    it('una sesión ya validada no se reasigna a otro correo', async () => {
      const session = await crearSesion(app);
      const primero = cuerpoCallback(config, session);
      await callback(primero);

      const intruso = await callback(cuerpoCallback(config, session));
      expect(intruso.body).toEqual({ validated: 0 });
      expect((await validar(session)).body.email).toBe(primero.email);
    });

    it('normaliza el correo: mayúsculas y espacios no crean otro usuario', async () => {
      const email = emailUnico();
      const a = await crearSesion(app);
      const b = await crearSesion(app);
      await callback(cuerpoCallback(config, a, { email }));
      await callback(cuerpoCallback(config, b, { email: `  ${email.toUpperCase()} ` }));
      expect(await prisma.user.count({ where: { email } })).toBe(1);
    });

    it('una sesión sin validar vence a los 15 minutos', async () => {
      const session = await crearSesion(app);
      await envejecer(session, 16 * MIN);
      const body = cuerpoCallback(config, session);
      expect((await callback(body)).body).toEqual({ validated: 0 });
      expect(await prisma.user.findUnique({ where: { email: body.email as string } })).toBeNull();
    });

    it('una sesión validada vence a los 30 días', async () => {
      const { token } = await iniciarSesion(app, config);
      expect((await validar(token)).body.validated).toBe(1);
      await envejecer(token, 31 * DIA);
      expect((await validar(token)).body).toEqual({ validated: 0 });
    });

    it('/validate con un valor que no es UUID responde 422', async () => {
      const res = await request(app).post('/api/v1/auth/validate').send({ session: 'no-es-uuid' });
      expect(res.status).toBe(422);
    });

    it('ninguna respuesta incluye los secretos de la aplicación', async () => {
      const session = await crearSesion(app);
      const res = await callback(cuerpoCallback(config, session));
      const texto = JSON.stringify(res.body) + JSON.stringify(res.headers);
      expect(texto).not.toContain(config.originalAuth.secretKey);
    });
  });

  describe('auditoría', () => {
    it('registra auth.register y auth.login con el id del usuario y sin su correo', async () => {
      const { email, token } = await iniciarSesion(app, config);
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });

      const filas = await prisma.auditLog.findMany({ where: { userId: usuario.id } });
      expect(filas.map((f) => f.action).sort()).toEqual(['auth.login', 'auth.register']);
      expect(JSON.stringify(filas)).not.toContain(email);
      expect(token).toBeTruthy();
    });

    it('un segundo login de la misma persona registra solo auth.login', async () => {
      const email = emailUnico();
      await iniciarSesion(app, config, { email });
      await iniciarSesion(app, config, { email });
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
      const acciones = (await prisma.auditLog.findMany({ where: { userId: usuario.id } })).map((f) => f.action).sort();
      expect(acciones).toEqual(['auth.login', 'auth.login', 'auth.register']);
    });
  });

  describe('DELETE /auth/session/:token', () => {
    it('cierra la sesión: deja de validar, /me responde 401 y queda auth.logout', async () => {
      const { token, email } = await iniciarSesion(app, config);
      const res = await request(app).delete(`/api/v1/auth/session/${token}`);
      expect(res.status).toBe(204);

      expect((await validar(token)).body).toEqual({ validated: 0 });
      expect((await request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(await prisma.auditLog.count({ where: { action: 'auth.logout', userId: usuario.id } })).toBe(1);
    });

    it('es idempotente: un token desconocido también responde 204 sin revelar nada', async () => {
      const res = await request(app).delete(`/api/v1/auth/session/${randomUUID()}`);
      expect(res.status).toBe(204);
    });

    it('un token que no es UUID responde 422', async () => {
      const res = await request(app).delete('/api/v1/auth/session/xyz');
      expect(res.status).toBe(422);
    });
  });
});

describe.skipIf(!testDatabaseUrl)('límite de peticiones de GET /auth/session', () => {
  it('responde 429 al pasar el máximo por minuto', async () => {
    const { app, prisma } = buildTestApp({ RATE_LIMIT_AUTH_SESSION_PER_MINUTE: '2' });
    try {
      expect((await request(app).get('/api/v1/auth/session')).status).toBe(200);
      expect((await request(app).get('/api/v1/auth/session')).status).toBe(200);
      const bloqueada = await request(app).get('/api/v1/auth/session');
      expect(bloqueada.status).toBe(429);
      expect(bloqueada.body.error.code).toBe('RATE_LIMITED');
    } finally {
      await prisma.$disconnect();
    }
  });
});
