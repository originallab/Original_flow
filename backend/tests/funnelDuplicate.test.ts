import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './helpers/db.js';
import { agregarMiembro, crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

describe.skipIf(!testDatabaseUrl)('copiar un funnel: POST /funnels/:id/duplicate', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const copiar = (token: string, id: string) => request(app).post(`/api/v1/funnels/${id}/duplicate`).set(encabezados(token));
  const miembro = (workspaceId: string, role: Parameters<typeof agregarMiembro>[4]) => agregarMiembro(app, prisma, config, workspaceId, role);

  async function funnel() {
    const n = await crearNegocio(app, config);
    const creado = await request(app)
      .post('/api/v1/funnels')
      .set(encabezados(n.token))
      .send({ workspaceId: n.workspace.id, name: 'Curso de datos', objective: 'venta', price: 1200, currency: 'MXN', productName: 'Datos', targetAudience: 'Analistas' });
    const f = creado.body as { id: string; slug: string };
    const bloques = [
      { key: 'hero', type: 'encabezado', order: 1, content: { title: 'Hola' }, style: {} },
      { key: 'pagar', type: 'boton', order: 2, content: { label: 'Comprar' }, style: {} },
    ];
    await request(app).put(`/api/v1/funnels/${f.id}/content`).set(encabezados(n.token)).send({ blocks: bloques });
    await request(app).put(`/api/v1/funnels/${f.id}/design-spec`).set(encabezados(n.token)).send({ template: 'impacto' });
    return { ...n, f };
  }

  it('crea una copia en borrador, «Copia de …», con otro slug, y el mismo contenido, diseño, precio y datos', async () => {
    const o = await funnel();
    const res = await copiar(o.token, o.f.id);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Copia de Curso de datos', status: 'draft', objective: 'venta', price: 1200, currency: 'MXN', productName: 'Datos', targetAudience: 'Analistas', workspaceId: o.workspace.id });
    expect(res.body.id).not.toBe(o.f.id);
    expect(res.body.slug).not.toBe(o.f.slug);
    expect(res.body.designSpec).toEqual({ template: 'impacto' });
    expect(res.body.content.blocks.map((b: { key: string }) => b.key)).toEqual(['hero', 'pagar']);
  });

  it('la copia tiene sus propios botones (CTA) y el original no cambia', async () => {
    const o = await funnel();
    const antes = await prisma.funnel.findUniqueOrThrow({ where: { id: o.f.id } });
    const res = await copiar(o.token, o.f.id);
    const ctas = await prisma.cTA.findMany({ where: { funnelId: res.body.id } });
    expect(ctas.map((c) => [c.blockKey, c.actionType])).toEqual([['pagar', 'checkout']]);
    expect(await prisma.cTA.count({ where: { funnelId: o.f.id } })).toBe(1);
    const despues = await prisma.funnel.findUniqueOrThrow({ where: { id: o.f.id } });
    expect(despues.updatedAt).toEqual(antes.updatedAt);
  });

  it('copiar un funnel publicado da una copia en borrador; copiar varias veces da slugs distintos', async () => {
    const o = await funnel();
    await prisma.funnel.update({ where: { id: o.f.id }, data: { status: 'published' } });
    const a = await copiar(o.token, o.f.id);
    const b = await copiar(o.token, o.f.id);
    expect(a.body.status).toBe('draft');
    expect(new Set([o.f.slug, a.body.slug, b.body.slug]).size).toBe(3);
    expect((await prisma.funnel.findUniqueOrThrow({ where: { id: o.f.id } })).status).toBe('published');
  });

  it('queda auditado con el origen', async () => {
    const o = await funnel();
    const res = await copiar(o.token, o.f.id);
    const fila = await prisma.auditLog.findFirstOrThrow({ where: { action: 'funnel.duplicate', resourceId: res.body.id } });
    expect(fila.metadata).toEqual({ from: o.f.id });
  });

  it('marketing y diseño pueden copiar; ventas y análisis reciben 403; otro cliente 404; sin sesión 401', async () => {
    const o = await funnel();
    for (const role of ['marketing_manager', 'disenador'] as const) expect((await copiar((await miembro(o.workspace.id, role)).token, o.f.id)).status).toBe(201);
    for (const role of ['vendedor', 'analista'] as const) expect((await copiar((await miembro(o.workspace.id, role)).token, o.f.id)).status).toBe(403);
    const ajeno = await crearNegocio(app, config);
    expect((await copiar(ajeno.token, o.f.id)).status).toBe(404);
    expect((await copiar(o.token, randomUUID())).status).toBe(404);
    expect((await request(app).post(`/api/v1/funnels/${o.f.id}/duplicate`)).status).toBe(401);
  });
});
