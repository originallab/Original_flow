import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import type { MembershipRole } from '../src/generated/prisma/client.js';
import { emailUnico, iniciarSesion } from './helpers/auth.js';
import { testDatabaseUrl } from './helpers/db.js';
import { buildTestApp } from './helpers/testApp.js';

const PALETA = { primary: '#0E7A63', secondary: '#0A4A3C', accent: '#F2B544', background: '#EAF4F0', text: '#0F1F1A' };

describe.skipIf(!testDatabaseUrl)('workspaces y equipo', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const con = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (token: string, ruta: string) => request(app).get(`/api/v1${ruta}`).set(con(token));
  const post = (token: string, ruta: string, body: object) => request(app).post(`/api/v1${ruta}`).set(con(token)).send(body);
  const patch = (token: string, ruta: string, body: object) => request(app).patch(`/api/v1${ruta}`).set(con(token)).send(body);
  const del = (token: string, ruta: string) => request(app).delete(`/api/v1${ruta}`).set(con(token));

  /** Una persona que inicia sesión y crea su negocio: queda como administradora de su cliente. */
  async function negocio(nombre = `Marca ${randomUUID().slice(0, 6)}`) {
    const sesion = await iniciarSesion(app, config);
    const res = await post(sesion.token, '/workspaces', { name: nombre, country: 'México', industry: 'educacion' });
    return { ...sesion, workspace: res.body as { id: string; clientId: string; name: string } };
  }

  /** Una persona con sesión y una membresía de workspace puesta directamente en la base. */
  async function miembro(workspaceId: string, role: MembershipRole) {
    const sesion = await iniciarSesion(app, config);
    const usuario = await prisma.user.findUniqueOrThrow({ where: { email: sesion.email } });
    const m = await prisma.membership.create({ data: { userId: usuario.id, role, status: 'active', workspaceId } });
    return { ...sesion, userId: usuario.id, membershipId: m.id };
  }

  describe('POST /workspaces', () => {
    it('sin sesión responde 401', async () => {
      const res = await request(app).post('/api/v1/workspaces').send({ name: 'X' });
      expect(res.status).toBe(401);
    });

    it('crea el cliente, el workspace, 5 etapas de lead y la membresía de administrador', async () => {
      const { token, email, workspace } = await negocio('Academia Nimbral');
      const res = await get(token, `/workspaces/${workspace.id}`);
      expect(res.body).toMatchObject({ name: 'Academia Nimbral', country: 'México', industry: 'educacion', role: 'client_admin' });

      const etapas = await prisma.leadStage.findMany({ where: { workspaceId: workspace.id }, orderBy: { order: 'asc' } });
      expect(etapas.map((e) => e.name)).toEqual(['Nuevo', 'Contactado', 'Interesado', 'Oportunidad', 'Cliente']);
      expect(etapas.filter((e) => e.isWon).map((e) => e.name)).toEqual(['Cliente']);
      expect(etapas.filter((e) => e.isFinal).map((e) => e.name)).toEqual(['Cliente']);

      const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
      const membresia = await prisma.membership.findFirstOrThrow({ where: { userId: usuario.id } });
      expect(membresia).toMatchObject({ role: 'client_admin', status: 'active', clientId: workspace.clientId });
      expect(await prisma.auditLog.count({ where: { action: 'workspace.create', workspaceId: workspace.id } })).toBe(1);
    });

    it('después del alta, /me y /validate muestran el workspace y el perfil completo', async () => {
      const { token, workspace } = await negocio();
      const me = await get(token, '/me');
      expect(me.body.workspaces.map((w: { id: string }) => w.id)).toEqual([workspace.id]);
      const validacion = await request(app).post('/api/v1/auth/validate').send({ session: token });
      expect(validacion.body.profileComplete).toBe(true);
    });

    it('un segundo workspace de la misma persona cuelga del mismo cliente', async () => {
      const { token, workspace } = await negocio();
      const segundo = await post(token, '/workspaces', { name: 'Segunda marca' });
      expect(segundo.status).toBe(201);
      expect(segundo.body.clientId).toBe(workspace.clientId);
      expect(await prisma.workspace.count({ where: { clientId: workspace.clientId } })).toBe(2);
    });

    it('sin nombre responde 422 y no crea nada', async () => {
      const { token } = await iniciarSesion(app, config);
      const res = await post(token, '/workspaces', { country: 'México' });
      expect(res.status).toBe(422);
      expect((await get(token, '/workspaces')).body.total).toBe(0);
    });

    it('nunca devuelve la configuración de pagos', async () => {
      const { token, workspace } = await negocio();
      await prisma.workspace.update({ where: { id: workspace.id }, data: { paymentConfig: { apiKeyEnc: 'llave-cifrada-secreta' } } });
      for (const res of [await get(token, `/workspaces/${workspace.id}`), await get(token, '/workspaces')]) {
        expect(JSON.stringify(res.body)).not.toContain('llave-cifrada-secreta');
        expect(JSON.stringify(res.body)).not.toContain('paymentConfig');
      }
    });
  });

  describe('GET /workspaces', () => {
    it('lista solo los workspaces de la persona', async () => {
      const mio = await negocio();
      const ajeno = await negocio();
      const res = await get(mio.token, '/workspaces');
      expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 25 });
      expect(res.body.items.map((w: { id: string }) => w.id)).toEqual([mio.workspace.id]);
      expect(JSON.stringify(res.body)).not.toContain(ajeno.workspace.id);
    });

    it('pagina con page y pageSize', async () => {
      const { token } = await negocio();
      await post(token, '/workspaces', { name: 'Otra' });
      const pagina = await get(token, '/workspaces?page=2&pageSize=1');
      expect(pagina.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
      expect(pagina.body.items).toHaveLength(1);
    });

    it('rechaza un pageSize fuera de rango con 422', async () => {
      const { token } = await negocio();
      expect((await get(token, '/workspaces?pageSize=1000')).status).toBe(422);
    });

    it('el super_admin ve los workspaces de todos los clientes', async () => {
      const ajeno = await negocio();
      const admin = await iniciarSesion(app, config);
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email: admin.email } });
      await prisma.membership.create({ data: { userId: usuario.id, role: 'super_admin', status: 'active' } });

      const res = await get(admin.token, `/workspaces/${ajeno.workspace.id}`);
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('super_admin');
    });
  });

  describe('GET /workspaces/:id', () => {
    it('un workspace de otro cliente responde 404, igual que uno que no existe', async () => {
      const mio = await negocio();
      const ajeno = await negocio();
      const delAjeno = await get(mio.token, `/workspaces/${ajeno.workspace.id}`);
      const inexistente = await get(mio.token, `/workspaces/${randomUUID()}`);
      expect(delAjeno.status).toBe(404);
      expect(inexistente.status).toBe(404);
      expect(delAjeno.body.error).toEqual(inexistente.body.error);
    });

    it('un id que no es UUID responde 422', async () => {
      const { token } = await negocio();
      expect((await get(token, '/workspaces/abc')).status).toBe(422);
    });

    it('cualquier rol del workspace puede verlo y ve su propio rol', async () => {
      const { workspace } = await negocio();
      const analista = await miembro(workspace.id, 'analista');
      const res = await get(analista.token, `/workspaces/${workspace.id}`);
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('analista');
    });
  });

  describe('PATCH /workspaces/:id', () => {
    it('el administrador cambia sus datos, el logo y la paleta, y queda auditado', async () => {
      const { token, workspace } = await negocio();
      const res = await patch(token, `/workspaces/${workspace.id}`, { name: 'Nuevo nombre', logoFileId: 'file_123', brandPalette: PALETA });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Nuevo nombre', logoFileId: 'file_123', brandPalette: PALETA });
      const auditoria = await prisma.auditLog.findFirstOrThrow({ where: { action: 'workspace.update', workspaceId: workspace.id } });
      expect(auditoria.metadata).toEqual({ fields: ['name', 'logoFileId', 'brandPalette'] });
    });

    it('con null borra un campo', async () => {
      const { token, workspace } = await negocio();
      await patch(token, `/workspaces/${workspace.id}`, { logoFileId: 'file_1', brandPalette: PALETA });
      const res = await patch(token, `/workspaces/${workspace.id}`, { logoFileId: null, brandPalette: null });
      expect(res.body).toMatchObject({ logoFileId: null, brandPalette: null });
    });

    it('rechaza una paleta con un color inválido con 422', async () => {
      const { token, workspace } = await negocio();
      const res = await patch(token, `/workspaces/${workspace.id}`, { brandPalette: { ...PALETA, primary: 'verde' } });
      expect(res.status).toBe(422);
    });

    it('rechaza un cuerpo vacío con 422', async () => {
      const { token, workspace } = await negocio();
      expect((await patch(token, `/workspaces/${workspace.id}`, {})).status).toBe(422);
    });

    it('ignora campos que no se pueden editar, como clientId', async () => {
      const { token, workspace } = await negocio();
      const otroCliente = await prisma.client.create({ data: { name: 'Otro' } });
      await patch(token, `/workspaces/${workspace.id}`, { name: 'Cambiado', clientId: otroCliente.id });
      expect((await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).clientId).toBe(workspace.clientId);
    });

    it('un rol sin permiso de gestión recibe 403 y no cambia nada', async () => {
      const { workspace } = await negocio('Original');
      const marketing = await miembro(workspace.id, 'marketing_manager');
      const res = await patch(marketing.token, `/workspaces/${workspace.id}`, { name: 'Hackeado' });
      expect(res.status).toBe(403);
      expect((await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).name).toBe('Original');
    });

    it('un workspace de otro cliente responde 404 (no 403)', async () => {
      const mio = await negocio();
      const ajeno = await negocio();
      expect((await patch(mio.token, `/workspaces/${ajeno.workspace.id}`, { name: 'x' })).status).toBe(404);
    });
  });

  describe('equipo', () => {
    it('el administrador lista el equipo; un analista recibe 403; un ajeno, 404', async () => {
      const { token, workspace, email } = await negocio();
      const analista = await miembro(workspace.id, 'analista');
      const ajeno = await negocio();

      const lista = await get(token, `/workspaces/${workspace.id}/members`);
      expect(lista.status).toBe(200);
      expect(lista.body.items.map((m: { email: string }) => m.email).sort()).toEqual([analista.email, email].sort());
      expect((await get(analista.token, `/workspaces/${workspace.id}/members`)).status).toBe(403);
      expect((await get(ajeno.token, `/workspaces/${workspace.id}/members`)).status).toBe(404);
    });

    it('invitar a un correo nuevo la deja invitada y se activa sola cuando entra por primera vez', async () => {
      const { token, workspace } = await negocio();
      const correo = emailUnico();
      const invitacion = await post(token, `/workspaces/${workspace.id}/members`, { email: correo.toUpperCase(), role: 'vendedor' });
      expect(invitacion.status).toBe(201);
      expect(invitacion.body).toMatchObject({ email: correo, role: 'vendedor', status: 'invited', userId: null });

      const nuevo = await iniciarSesion(app, config, { email: correo });
      const me = await get(nuevo.token, '/me');
      expect(me.body.memberships).toMatchObject([{ role: 'vendedor', workspaceId: workspace.id }]);
      expect(me.body.workspaces.map((w: { id: string }) => w.id)).toEqual([workspace.id]);
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email: correo } });
      expect(await prisma.auditLog.count({ where: { action: 'member.accept', userId: usuario.id } })).toBe(1);
    });

    it('invitar a alguien que ya tiene cuenta la activa de inmediato', async () => {
      const { token, workspace } = await negocio();
      const existente = await iniciarSesion(app, config);
      const res = await post(token, `/workspaces/${workspace.id}/members`, { email: existente.email, role: 'disenador' });
      expect(res.body).toMatchObject({ status: 'active', role: 'disenador' });
      expect((await get(existente.token, `/workspaces/${workspace.id}`)).status).toBe(200);
    });

    it('invitar dos veces al mismo correo responde 409', async () => {
      const { token, workspace } = await negocio();
      const correo = emailUnico();
      await post(token, `/workspaces/${workspace.id}/members`, { email: correo, role: 'analista' });
      const otra = await post(token, `/workspaces/${workspace.id}/members`, { email: correo.toUpperCase(), role: 'vendedor' });
      expect(otra.status).toBe(409);
      expect(otra.body.error.code).toBe('MEMBER_ALREADY_EXISTS');
    });

    it('no permite asignar super_admin ni un rol inventado (422)', async () => {
      const { token, workspace } = await negocio();
      for (const role of ['super_admin', 'dios']) {
        expect((await post(token, `/workspaces/${workspace.id}/members`, { email: emailUnico(), role })).status).toBe(422);
      }
    });

    it('un rol sin permiso no puede invitar (403)', async () => {
      const { workspace } = await negocio();
      const vendedor = await miembro(workspace.id, 'vendedor');
      const res = await post(vendedor.token, `/workspaces/${workspace.id}/members`, { email: emailUnico(), role: 'analista' });
      expect(res.status).toBe(403);
    });

    it('invitar a otro administrador le da acceso a todos los workspaces del cliente', async () => {
      const { token, workspace } = await negocio();
      const segundo = await post(token, '/workspaces', { name: 'Segunda' });
      const otro = await iniciarSesion(app, config);
      const res = await post(token, `/workspaces/${workspace.id}/members`, { email: otro.email, role: 'client_admin' });
      expect(res.body).toMatchObject({ role: 'client_admin', clientId: workspace.clientId, workspaceId: null });

      const ids = (await get(otro.token, '/workspaces')).body.items.map((w: { id: string }) => w.id).sort();
      expect(ids).toEqual([workspace.id, segundo.body.id].sort());
    });

    it('quitar a un miembro le quita el acceso y queda auditado', async () => {
      const { token, workspace } = await negocio();
      const analista = await miembro(workspace.id, 'analista');
      const res = await del(token, `/workspaces/${workspace.id}/members/${analista.membershipId}`);
      expect(res.status).toBe(204);
      expect((await get(analista.token, `/workspaces/${workspace.id}`)).status).toBe(404);
      expect(await prisma.auditLog.count({ where: { action: 'member.remove', resourceId: analista.membershipId } })).toBe(1);
    });

    it('no se puede quitar al único administrador del cliente (409), pero sí cuando hay otro', async () => {
      const { token, workspace, email } = await negocio();
      const admin = await prisma.membership.findFirstOrThrow({ where: { clientId: workspace.clientId, role: 'client_admin' } });
      const bloqueado = await del(token, `/workspaces/${workspace.id}/members/${admin.id}`);
      expect(bloqueado.status).toBe(409);
      expect(bloqueado.body.error.code).toBe('LAST_CLIENT_ADMIN');

      const segundo = await iniciarSesion(app, config);
      await post(token, `/workspaces/${workspace.id}/members`, { email: segundo.email, role: 'client_admin' });
      expect((await del(token, `/workspaces/${workspace.id}/members/${admin.id}`)).status).toBe(204);
      expect(email).toBeTruthy();
    });

    it('un memberId de otro workspace responde 404 y no borra nada', async () => {
      const mio = await negocio();
      const ajeno = await negocio();
      const analistaAjeno = await miembro(ajeno.workspace.id, 'analista');
      const res = await del(mio.token, `/workspaces/${mio.workspace.id}/members/${analistaAjeno.membershipId}`);
      expect(res.status).toBe(404);
      expect(await prisma.membership.count({ where: { id: analistaAjeno.membershipId } })).toBe(1);
    });

    it('un rol sin permiso no puede quitar miembros (403)', async () => {
      const { workspace } = await negocio();
      const marketing = await miembro(workspace.id, 'marketing_manager');
      const analista = await miembro(workspace.id, 'analista');
      const res = await del(marketing.token, `/workspaces/${workspace.id}/members/${analista.membershipId}`);
      expect(res.status).toBe(403);
      expect(await prisma.membership.count({ where: { id: analista.membershipId } })).toBe(1);
    });
  });
});
