import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { insertionIndex, withPlaced } from '../src/lib/leadStages.js';
import { testDatabaseUrl } from './helpers/db.js';
import { agregarMiembro, crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

const SIN_ID = '6c5b9f4e-6b0e-4a43-9d3b-0c1f4f3b7a11';

describe('orden de las etapas (sin base de datos)', () => {
  const etapas = (...finales: boolean[]) => finales.map((isFinal, index) => ({ id: `e${index + 1}`, isFinal }));

  it('sin posición cae justo antes de la final, o al final si no hay final', () => {
    expect(insertionIndex(etapas(false, false, false, true))).toBe(3);
    expect(insertionIndex(etapas(false, false))).toBe(2);
    expect(insertionIndex([])).toBe(0);
  });

  it('con posición (base 1) cae ahí, pero nunca después de la final ni antes de la primera', () => {
    const otras = etapas(false, false, false, true);
    expect(insertionIndex(otras, 1)).toBe(0);
    expect(insertionIndex(otras, 2)).toBe(1);
    expect(insertionIndex(otras, 4)).toBe(3);
    expect(insertionIndex(otras, 5)).toBe(3);
    expect(insertionIndex(otras, 99)).toBe(3);
    expect(insertionIndex(otras, 0)).toBe(0);
    expect(insertionIndex(otras, -4)).toBe(0);
    expect(insertionIndex(etapas(false, false), 99)).toBe(2);
  });

  it('inserta sin tocar la lista original', () => {
    const original = ['a', 'b', 'c'];
    expect(withPlaced(original, 'x', 1)).toEqual(['a', 'x', 'b', 'c']);
    expect(withPlaced(original, 'x', 3)).toEqual(['a', 'b', 'c', 'x']);
    expect(original).toEqual(['a', 'b', 'c']);
  });
});

describe.skipIf(!testDatabaseUrl)('etapas del tablero de leads', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const get = (token: string, ruta: string) => request(app).get(`/api/v1${ruta}`).set(encabezados(token));
  const post = (token: string, ruta: string, body: object = {}) => request(app).post(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const patch = (token: string, ruta: string, body: object) => request(app).patch(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const del = (token: string, ruta: string) => request(app).delete(`/api/v1${ruta}`).set(encabezados(token));
  const miembro = (workspaceId: string, role: Parameters<typeof agregarMiembro>[4]) => agregarMiembro(app, prisma, config, workspaceId, role);

  /** Un negocio con las cinco etapas de siempre: Nuevo, Contactado, Interesado, Oportunidad y Cliente (la final y ganada). */
  async function negocio() {
    const n = await crearNegocio(app, config);
    const funnel = (await post(n.token, '/funnels', { workspaceId: n.workspace.id, name: 'Curso', objective: 'leads' })).body as { id: string };
    const etapas = await prisma.leadStage.findMany({ where: { workspaceId: n.workspace.id }, orderBy: { order: 'asc' } });
    return { ...n, funnel, etapas };
  }
  type Negocio = Awaited<ReturnType<typeof negocio>>;

  const ruta = (n: Negocio) => `/workspaces/${n.workspace.id}/lead-stages`;
  /** Los nombres de las etapas en el orden en que están guardadas, y sus órdenes. */
  const tablero = async (n: Negocio) => {
    const etapas = await prisma.leadStage.findMany({ where: { workspaceId: n.workspace.id }, orderBy: { order: 'asc' } });
    return { nombres: etapas.map((e) => e.name), ordenes: etapas.map((e) => e.order) };
  };
  const SEGUIDAS = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

  describe('GET /workspaces/:id/lead-stages', () => {
    it('lista las etapas del tablero en orden, con la final y la ganada marcadas', async () => {
      const n = await negocio();
      const res = await get(n.token, ruta(n));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 5, page: 1, pageSize: 5 });
      expect(res.body.items).toEqual([
        { id: n.etapas[0]!.id, workspaceId: n.workspace.id, name: 'Nuevo', order: 1, isFinal: false, isWon: false },
        { id: n.etapas[1]!.id, workspaceId: n.workspace.id, name: 'Contactado', order: 2, isFinal: false, isWon: false },
        { id: n.etapas[2]!.id, workspaceId: n.workspace.id, name: 'Interesado', order: 3, isFinal: false, isWon: false },
        { id: n.etapas[3]!.id, workspaceId: n.workspace.id, name: 'Oportunidad', order: 4, isFinal: false, isWon: false },
        { id: n.etapas[4]!.id, workspaceId: n.workspace.id, name: 'Cliente', order: 5, isFinal: true, isWon: true },
      ]);
    });

    it('lo ven el marketing manager, el vendedor y el analista; el diseñador no (403)', async () => {
      const n = await negocio();
      for (const role of ['marketing_manager', 'vendedor', 'analista'] as const) {
        expect((await get((await miembro(n.workspace.id, role)).token, ruta(n))).status, role).toBe(200);
      }
      expect((await get((await miembro(n.workspace.id, 'disenador')).token, ruta(n))).status).toBe(403);
    });

    it('un negocio de otro cliente responde 404, uno inexistente también, y sin sesión 401', async () => {
      const n = await negocio();
      const ajeno = await crearNegocio(app, config);
      expect((await get(ajeno.token, ruta(n))).status).toBe(404);
      expect((await get(n.token, `/workspaces/${SIN_ID}/lead-stages`)).status).toBe(404);
      expect((await get(n.token, '/workspaces/no-es-un-id/lead-stages')).status).toBe(422);
      expect((await request(app).get(`/api/v1${ruta(n)}`)).status).toBe(401);
    });
  });

  describe('POST /workspaces/:id/lead-stages', () => {
    it('sin posición la etapa entra justo antes de la final, y los órdenes quedan seguidos', async () => {
      const n = await negocio();
      const res = await post(n.token, ruta(n), { name: '  Propuesta enviada ' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ workspaceId: n.workspace.id, name: 'Propuesta enviada', order: 5, isFinal: false, isWon: false });
      expect(await tablero(n)).toEqual({ nombres: ['Nuevo', 'Contactado', 'Interesado', 'Oportunidad', 'Propuesta enviada', 'Cliente'], ordenes: SEGUIDAS(6) });
    });

    it('con posición entra ahí y recorre las demás; pasada de la final se queda antes de ella', async () => {
      const n = await negocio();
      expect((await post(n.token, ruta(n), { name: 'Segunda', order: 2 })).body.order).toBe(2);
      expect((await post(n.token, ruta(n), { name: 'Primera', order: 1 })).body.order).toBe(1);
      expect((await post(n.token, ruta(n), { name: 'Casi al final', order: 99 })).body.order).toBe(7);
      expect(await tablero(n)).toEqual({
        nombres: ['Primera', 'Nuevo', 'Segunda', 'Contactado', 'Interesado', 'Oportunidad', 'Casi al final', 'Cliente'],
        ordenes: SEGUIDAS(8),
      });
    });

    it('los leads siguen en su etapa aunque cambie el orden', async () => {
      const n = await negocio();
      const lead = await prisma.lead.create({ data: { funnelId: n.funnel.id, leadStageId: n.etapas[1]!.id, email: 'a@correo.com' } });
      await post(n.token, ruta(n), { name: 'Nueva', order: 1 });
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).leadStageId).toBe(n.etapas[1]!.id);
      expect((await prisma.leadStage.findUniqueOrThrow({ where: { id: n.etapas[1]!.id } })).order).toBe(3);
    });

    it('un nombre vacío, de espacios o demasiado largo y una posición inválida responden 422', async () => {
      const n = await negocio();
      for (const body of [{}, { name: '' }, { name: '   ' }, { name: 'a'.repeat(61) }, { name: 7 }, { name: 'X', order: 0 }, { name: 'X', order: 1.5 }, { name: 'X', order: '2' }, { name: 'X', order: 101 }]) {
        expect((await post(n.token, ruta(n), body)).status, JSON.stringify(body)).toBe(422);
      }
      expect((await tablero(n)).nombres).toHaveLength(5);
      expect((await post(n.token, ruta(n), { name: 'a'.repeat(60) })).status).toBe(201);
    });

    it('solo el administrador agrega etapas: el marketing manager, el vendedor, el analista y el diseñador reciben 403', async () => {
      const n = await negocio();
      for (const role of ['marketing_manager', 'vendedor', 'analista', 'disenador'] as const) {
        expect((await post((await miembro(n.workspace.id, role)).token, ruta(n), { name: 'X' })).status, role).toBe(403);
      }
      expect((await tablero(n)).nombres).toHaveLength(5);
    });

    it('un negocio de otro cliente responde 404 y sin sesión 401; queda auditado', async () => {
      const n = await negocio();
      const ajeno = await crearNegocio(app, config);
      expect((await post(ajeno.token, ruta(n), { name: 'X' })).status).toBe(404);
      expect((await request(app).post(`/api/v1${ruta(n)}`).send({ name: 'X' })).status).toBe(401);
      expect((await tablero(n)).nombres).toHaveLength(5);

      const creada = await post(n.token, ruta(n), { name: 'Auditada' });
      expect(await prisma.auditLog.count({ where: { action: 'lead_stage.create', resourceId: creada.body.id } })).toBe(1);
    });
  });

  describe('PATCH /lead-stages/:id', () => {
    it('renombra una etapa, también la final', async () => {
      const n = await negocio();
      expect((await patch(n.token, `/lead-stages/${n.etapas[1]!.id}`, { name: ' Primer contacto ' })).body).toMatchObject({ name: 'Primer contacto', order: 2 });
      expect((await patch(n.token, `/lead-stages/${n.etapas[4]!.id}`, { name: 'Ganado' })).body).toMatchObject({ name: 'Ganado', order: 5, isFinal: true, isWon: true });
    });

    it('mueve una etapa hacia arriba y hacia abajo y los órdenes quedan seguidos', async () => {
      const n = await negocio();
      const [nuevo, contactado, interesado] = n.etapas as [(typeof n.etapas)[number], (typeof n.etapas)[number], (typeof n.etapas)[number]];
      expect((await patch(n.token, `/lead-stages/${interesado.id}`, { order: 1 })).body.order).toBe(1);
      expect(await tablero(n)).toEqual({ nombres: ['Interesado', 'Nuevo', 'Contactado', 'Oportunidad', 'Cliente'], ordenes: SEGUIDAS(5) });

      expect((await patch(n.token, `/lead-stages/${nuevo.id}`, { order: 4 })).body.order).toBe(4);
      expect(await tablero(n)).toEqual({ nombres: ['Interesado', 'Contactado', 'Oportunidad', 'Nuevo', 'Cliente'], ordenes: SEGUIDAS(5) });

      expect((await patch(n.token, `/lead-stages/${contactado.id}`, { order: 99 })).body.order).toBe(4);
      expect((await tablero(n)).nombres.at(-1)).toBe('Cliente');
    });

    it('renombrar y mover en la misma petición hace las dos cosas; mover a donde ya está no cambia nada', async () => {
      const n = await negocio();
      const res = await patch(n.token, `/lead-stages/${n.etapas[2]!.id}`, { name: 'Calificado', order: 1 });
      expect(res.body).toMatchObject({ name: 'Calificado', order: 1 });
      expect(await tablero(n)).toEqual({ nombres: ['Calificado', 'Nuevo', 'Contactado', 'Oportunidad', 'Cliente'], ordenes: SEGUIDAS(5) });

      const igual = await patch(n.token, `/lead-stages/${n.etapas[0]!.id}`, { order: 2 });
      expect(igual.status).toBe(200);
      expect(igual.body.order).toBe(2);
      expect((await tablero(n)).nombres).toEqual(['Calificado', 'Nuevo', 'Contactado', 'Oportunidad', 'Cliente']);
    });

    it('la etapa final no se mueve (409), aunque sí puede dejarse donde está', async () => {
      const n = await negocio();
      const res = await patch(n.token, `/lead-stages/${n.etapas[4]!.id}`, { order: 1 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('STAGE_PROTECTED');
      expect((await patch(n.token, `/lead-stages/${n.etapas[4]!.id}`, { order: 5 })).status).toBe(200);
      expect(await tablero(n)).toEqual({ nombres: ['Nuevo', 'Contactado', 'Interesado', 'Oportunidad', 'Cliente'], ordenes: SEGUIDAS(5) });
    });

    it('un cuerpo vacío, un nombre inválido o una posición inválida responden 422', async () => {
      const n = await negocio();
      for (const body of [{}, { name: '' }, { name: 'a'.repeat(61) }, { order: 0 }, { order: 1.5 }, { order: 101 }, { name: 'ok', order: 'x' }]) {
        expect((await patch(n.token, `/lead-stages/${n.etapas[1]!.id}`, body)).status, JSON.stringify(body)).toBe(422);
      }
      expect((await patch(n.token, '/lead-stages/no-es-un-id', { name: 'X' })).status).toBe(422);
      expect((await tablero(n)).nombres[1]).toBe('Contactado');
    });

    it('solo el administrador cambia etapas (403 al resto); una de otro cliente o inexistente responde 404', async () => {
      const n = await negocio();
      const ajeno = await crearNegocio(app, config);
      for (const role of ['marketing_manager', 'vendedor', 'analista', 'disenador'] as const) {
        expect((await patch((await miembro(n.workspace.id, role)).token, `/lead-stages/${n.etapas[1]!.id}`, { name: 'X' })).status, role).toBe(403);
      }
      expect((await patch(ajeno.token, `/lead-stages/${n.etapas[1]!.id}`, { name: 'X' })).status).toBe(404);
      expect((await patch(n.token, `/lead-stages/${SIN_ID}`, { name: 'X' })).body.error.code).toBe('STAGE_NOT_FOUND');
      expect((await request(app).patch(`/api/v1/lead-stages/${n.etapas[1]!.id}`).send({ name: 'X' })).status).toBe(401);
      expect((await tablero(n)).nombres[1]).toBe('Contactado');
    });

    it('queda auditado', async () => {
      const n = await negocio();
      await patch(n.token, `/lead-stages/${n.etapas[1]!.id}`, { name: 'Otro nombre' });
      expect(await prisma.auditLog.count({ where: { action: 'lead_stage.update', resourceId: n.etapas[1]!.id } })).toBe(1);
    });
  });

  describe('DELETE /lead-stages/:id', () => {
    it('quita la etapa y cierra el hueco', async () => {
      const n = await negocio();
      const res = await del(n.token, `/lead-stages/${n.etapas[1]!.id}`);
      expect(res.status).toBe(204);
      expect(await tablero(n)).toEqual({ nombres: ['Nuevo', 'Interesado', 'Oportunidad', 'Cliente'], ordenes: SEGUIDAS(4) });
      expect(await prisma.auditLog.count({ where: { action: 'lead_stage.delete', resourceId: n.etapas[1]!.id } })).toBe(1);
    });

    it('la final y la ganada no se quitan (409), tampoco una con leads, que dice cuántos son', async () => {
      const n = await negocio();
      const final = await del(n.token, `/lead-stages/${n.etapas[4]!.id}`);
      expect(final.status).toBe(409);
      expect(final.body.error.code).toBe('STAGE_PROTECTED');

      await prisma.leadStage.update({ where: { id: n.etapas[3]!.id }, data: { isWon: true } });
      expect((await del(n.token, `/lead-stages/${n.etapas[3]!.id}`)).body.error.code).toBe('STAGE_PROTECTED');

      await prisma.lead.createMany({ data: [1, 2, 3].map((i) => ({ funnelId: n.funnel.id, leadStageId: n.etapas[2]!.id, email: `l${i}@correo.com` })) });
      const conLeads = await del(n.token, `/lead-stages/${n.etapas[2]!.id}`);
      expect(conLeads.status).toBe(409);
      expect(conLeads.body.error.code).toBe('STAGE_NOT_EMPTY');
      expect(conLeads.body.error.details).toEqual({ leads: 3 });
      expect((await tablero(n)).nombres).toHaveLength(5);
    });

    it('una etapa sin leads se quita aunque otras tengan; los leads de las demás no se tocan', async () => {
      const n = await negocio();
      const lead = await prisma.lead.create({ data: { funnelId: n.funnel.id, leadStageId: n.etapas[0]!.id, email: 'a@correo.com' } });
      expect((await del(n.token, `/lead-stages/${n.etapas[2]!.id}`)).status).toBe(204);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).leadStageId).toBe(n.etapas[0]!.id);
    });

    it('solo el administrador quita etapas (403 al resto); una de otro cliente o inexistente responde 404', async () => {
      const n = await negocio();
      const ajeno = await crearNegocio(app, config);
      for (const role of ['marketing_manager', 'vendedor', 'analista', 'disenador'] as const) {
        expect((await del((await miembro(n.workspace.id, role)).token, `/lead-stages/${n.etapas[1]!.id}`)).status, role).toBe(403);
      }
      expect((await del(ajeno.token, `/lead-stages/${n.etapas[1]!.id}`)).status).toBe(404);
      expect((await del(n.token, `/lead-stages/${SIN_ID}`)).status).toBe(404);
      expect((await del(n.token, '/lead-stages/no-es-un-id')).status).toBe(422);
      expect((await request(app).delete(`/api/v1/lead-stages/${n.etapas[1]!.id}`)).status).toBe(401);
      expect((await tablero(n)).nombres).toHaveLength(5);
    });
  });
});
