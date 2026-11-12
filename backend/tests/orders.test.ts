import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './helpers/db.js';
import { agregarMiembro, crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

type Estado = 'pending' | 'paid' | 'cancelled' | 'failed';

describe.skipIf(!testDatabaseUrl)('ventas del negocio: GET /orders', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const get = (token: string, ruta: string) => request(app).get(`/api/v1${ruta}`).set(encabezados(token));
  const miembro = (workspaceId: string, role: Parameters<typeof agregarMiembro>[4]) => agregarMiembro(app, prisma, config, workspaceId, role);

  async function crearFunnel(token: string, workspaceId: string, name: string) {
    const res = await request(app).post('/api/v1/funnels').set(encabezados(token)).send({ workspaceId, name, objective: 'venta', price: 100 });
    return res.body as { id: string };
  }

  /** Una orden puesta directamente en la base, con su lead opcional. */
  async function orden(funnelId: string, status: Estado, amount = 100, extra: { leadName?: string; creadaHace?: number } = {}) {
    const lead = extra.leadName
      ? await prisma.lead.create({
          data: {
            funnelId,
            name: extra.leadName,
            email: 'comprador@correo.com',
            leadStageId: (await prisma.leadStage.findFirstOrThrow({ where: { workspace: { funnels: { some: { id: funnelId } } } }, orderBy: { order: 'asc' } })).id,
          },
        })
      : null;
    return prisma.order.create({
      data: {
        funnelId,
        leadId: lead?.id,
        orderNumber: `ON-${randomUUID()}`,
        amount,
        currency: 'MXN',
        status,
        paymentMethod: status === 'paid' ? 'stripe' : null,
        customerEmail: 'comprador@correo.com',
        paymentUrl: 'https://pago.ejemplo.com/secreta',
        paidAt: status === 'paid' ? new Date() : null,
        createdAt: new Date(Date.now() - (extra.creadaHace ?? 0) * 60_000),
      },
    });
  }

  async function negocio() {
    const n = await crearNegocio(app, config);
    const a = await crearFunnel(n.token, n.workspace.id, 'Curso A');
    const b = await crearFunnel(n.token, n.workspace.id, 'Curso B');
    return { ...n, a, b };
  }

  it('lista las órdenes del negocio, de la más nueva a la más vieja, con el monto como número y los nombres del funnel y del lead', async () => {
    const n = await negocio();
    const vieja = await orden(n.a.id, 'paid', 1200.5, { leadName: 'María', creadaHace: 30 });
    const nueva = await orden(n.b.id, 'pending', 99, { creadaHace: 1 });
    const res = await get(n.token, `/orders?workspaceId=${n.workspace.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 2, page: 1, pageSize: 25 });
    expect(res.body.items.map((o: { id: string }) => o.id)).toEqual([nueva.id, vieja.id]);
    expect(res.body.items[1]).toMatchObject({
      id: vieja.id,
      funnelName: 'Curso A',
      leadName: 'María',
      orderNumber: vieja.orderNumber,
      amount: 1200.5,
      currency: 'MXN',
      status: 'paid',
      paymentMethod: 'stripe',
      customerEmail: 'comprador@correo.com',
    });
    expect(res.body.items[0]).toMatchObject({ leadName: null, funnelName: 'Curso B', amount: 99 });
  });

  it('nunca expone el token público ni la dirección de pago', async () => {
    const n = await negocio();
    const o = await orden(n.a.id, 'pending');
    for (const ruta of [`/orders?workspaceId=${n.workspace.id}`, `/orders/${o.id}`]) {
      const texto = JSON.stringify((await get(n.token, ruta)).body);
      expect(texto).not.toContain(o.publicToken);
      expect(texto).not.toContain('pago.ejemplo.com');
      expect(texto).not.toContain('paymentUrl');
    }
  });

  it('filtra por funnel y por estado, y se pagina', async () => {
    const n = await negocio();
    await orden(n.a.id, 'paid', 100, { creadaHace: 5 });
    await orden(n.a.id, 'pending', 100, { creadaHace: 4 });
    await orden(n.b.id, 'paid', 100, { creadaHace: 3 });
    const base = `/orders?workspaceId=${n.workspace.id}`;
    expect((await get(n.token, `${base}&funnelId=${n.a.id}`)).body.total).toBe(2);
    expect((await get(n.token, `${base}&status=paid`)).body.total).toBe(2);
    expect((await get(n.token, `${base}&funnelId=${n.a.id}&status=paid`)).body.total).toBe(1);
    const pagina = await get(n.token, `${base}&pageSize=2&page=2`);
    expect(pagina.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(pagina.body.items).toHaveLength(1);
  });

  it('un filtro inválido (estado desconocido, ids que no son UUID, falta el negocio) responde 422', async () => {
    const n = await negocio();
    for (const ruta of [`/orders?workspaceId=${n.workspace.id}&status=pagada`, `/orders?workspaceId=${n.workspace.id}&funnelId=x`, '/orders', '/orders?workspaceId=x']) {
      expect((await get(n.token, ruta)).status).toBe(422);
    }
  });

  it('no mezcla negocios: las órdenes de otro cliente no aparecen y su workspace responde 404', async () => {
    const mio = await negocio();
    const ajeno = await negocio();
    await orden(mio.a.id, 'paid');
    const suya = await orden(ajeno.a.id, 'paid');
    expect((await get(mio.token, `/orders?workspaceId=${mio.workspace.id}`)).body.total).toBe(1);
    expect((await get(mio.token, `/orders?workspaceId=${ajeno.workspace.id}`)).status).toBe(404);
    expect((await get(mio.token, `/orders/${suya.id}`)).status).toBe(404);
    // Y filtrar por un funnel ajeno dentro de mi negocio no devuelve nada ajeno.
    expect((await get(mio.token, `/orders?workspaceId=${mio.workspace.id}&funnelId=${ajeno.a.id}`)).body.total).toBe(0);
  });

  it('el detalle devuelve la orden; una que no existe responde 404', async () => {
    const n = await negocio();
    const o = await orden(n.a.id, 'paid', 250, { leadName: 'Luis' });
    const res = await get(n.token, `/orders/${o.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: o.id, amount: 250, leadName: 'Luis', funnelName: 'Curso A' });
    const falta = await get(n.token, `/orders/${randomUUID()}`);
    expect(falta.status).toBe(404);
    expect(falta.body.error.code).toBe('ORDER_NOT_FOUND');
    expect((await get(n.token, '/orders/no-es-uuid')).status).toBe(422);
  });

  it('administración, marketing, ventas y análisis pueden ver las ventas; el diseño no (403)', async () => {
    const n = await negocio();
    const o = await orden(n.a.id, 'paid');
    for (const role of ['marketing_manager', 'vendedor', 'analista'] as const) {
      const otro = await miembro(n.workspace.id, role);
      expect((await get(otro.token, `/orders?workspaceId=${n.workspace.id}`)).status).toBe(200);
      expect((await get(otro.token, `/orders/${o.id}`)).status).toBe(200);
    }
    const diseno = await miembro(n.workspace.id, 'disenador');
    expect((await get(diseno.token, `/orders?workspaceId=${n.workspace.id}`)).status).toBe(403);
    expect((await get(diseno.token, `/orders/${o.id}`)).status).toBe(403);
  });

  it('sin sesión responde 401', async () => {
    const n = await negocio();
    expect((await request(app).get(`/api/v1/orders?workspaceId=${n.workspace.id}`)).status).toBe(401);
  });
});
