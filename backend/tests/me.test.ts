import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { crearSesion, iniciarSesion } from './helpers/auth.js';
import { testDatabaseUrl } from './helpers/db.js';
import { buildTestApp } from './helpers/testApp.js';

describe.skipIf(!testDatabaseUrl)('GET /me', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const me = (token?: string) => {
    const peticion = request(app).get('/api/v1/me');
    return token ? peticion.set('Authorization', `Bearer ${token}`) : peticion;
  };

  async function crearCliente() {
    const sufijo = randomUUID().slice(0, 8);
    const client = await prisma.client.create({ data: { name: `Cliente ${sufijo}` } });
    const a = await prisma.workspace.create({ data: { clientId: client.id, name: `Marca A ${sufijo}` } });
    const b = await prisma.workspace.create({ data: { clientId: client.id, name: `Marca B ${sufijo}` } });
    return { client, a, b };
  }

  describe('sin sesión válida', () => {
    it('responde 401 sin encabezado Authorization', async () => {
      const res = await me();
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('responde 401 con un encabezado mal formado', async () => {
      const res = await request(app).get('/api/v1/me').set('Authorization', 'Token abc');
      expect(res.status).toBe(401);
    });

    it('responde 401 con un token que no existe', async () => {
      expect((await me(randomUUID())).status).toBe(401);
    });

    it('responde 401 con una sesión que no se validó', async () => {
      expect((await me(await crearSesion(app))).status).toBe(401);
    });

    it('responde 401 con una sesión validada que ya venció', async () => {
      const { token } = await iniciarSesion(app, config);
      await prisma.session.update({ where: { token }, data: { createdAt: new Date(Date.now() - 31 * 24 * 60 * 60_000) } });
      expect((await me(token)).status).toBe(401);
    });
  });

  describe('con sesión válida', () => {
    it('una persona nueva ve su perfil sin membresías ni workspaces', async () => {
      const { token, email } = await iniciarSesion(app, config, { name: 'Ana Prueba' });
      const res = await me(token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        user: { id: expect.any(String), email, name: 'Ana Prueba' },
        memberships: [],
        workspaces: [],
      });
    });

    it('un rol de workspace ve solo su workspace', async () => {
      const { a } = await crearCliente();
      const { token, email } = await iniciarSesion(app, config);
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
      await prisma.membership.create({ data: { userId: usuario.id, role: 'marketing_manager', status: 'active', workspaceId: a.id } });

      const res = await me(token);
      expect(res.body.memberships).toEqual([{ id: expect.any(String), role: 'marketing_manager', clientId: null, workspaceId: a.id }]);
      expect(res.body.workspaces).toEqual([{ id: a.id, name: a.name, clientId: a.clientId }]);
    });

    it('el admin del cliente ve todos los workspaces de su cliente y ninguno de otro', async () => {
      const propio = await crearCliente();
      const ajeno = await crearCliente();
      const { token, email } = await iniciarSesion(app, config);
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
      await prisma.membership.create({ data: { userId: usuario.id, role: 'client_admin', status: 'active', clientId: propio.client.id } });

      const ids = ((await me(token)).body.workspaces as { id: string }[]).map((w) => w.id).sort();
      expect(ids).toEqual([propio.a.id, propio.b.id].sort());
      expect(ids).not.toContain(ajeno.a.id);
    });

    it('una invitación pendiente no da acceso a nada', async () => {
      const { a } = await crearCliente();
      const { token, email } = await iniciarSesion(app, config);
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
      await prisma.membership.create({ data: { userId: usuario.id, role: 'vendedor', status: 'invited', workspaceId: a.id } });

      const res = await me(token);
      expect(res.body.memberships).toEqual([]);
      expect(res.body.workspaces).toEqual([]);
    });

    it('/validate marca profileComplete cuando ya tiene una membresía activa', async () => {
      const { a } = await crearCliente();
      const { token, email } = await iniciarSesion(app, config);
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
      await prisma.membership.create({ data: { userId: usuario.id, role: 'analista', status: 'active', workspaceId: a.id } });

      const res = await request(app).post('/api/v1/auth/validate').send({ session: token });
      expect(res.body.profileComplete).toBe(true);
    });
  });
});
