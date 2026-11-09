import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './helpers/db.js';
import { agregarMiembro, crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

const FORM = { fields: [{ name: 'email', label: 'Correo', type: 'email', required: true }], submitLabel: 'Quiero info' };
const THANKS = { thankYou: { message: 'Gracias por registrarte' } };
const bloque = (key: string, type: string, content: object, order = 1) => ({ key, type, order, content, style: {} });
const PLANTILLA = { template: 'minimal' };

describe.skipIf(!testDatabaseUrl)('historial de versiones', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const get = (token: string, ruta: string) => request(app).get(`/api/v1${ruta}`).set(encabezados(token));
  const post = (token: string, ruta: string, body: object = {}) => request(app).post(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const put = (token: string, ruta: string, body: object) => request(app).put(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const patch = (token: string, ruta: string, body: object) => request(app).patch(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const miembro = (workspaceId: string, role: Parameters<typeof agregarMiembro>[4]) => agregarMiembro(app, prisma, config, workspaceId, role);

  /** Un funnel de captación listo para publicar: un encabezado y un formulario. */
  async function funnelListo() {
    const n = await crearNegocio(app, config);
    const res = await post(n.token, '/funnels', { workspaceId: n.workspace.id, name: 'Curso de datos', objective: 'leads', price: 100 });
    const funnel = res.body as { id: string; slug: string };
    await put(n.token, `/funnels/${funnel.id}/content`, { blocks: [bloque('hero', 'encabezado', { title: 'Versión uno' }, 1), bloque('form', 'formulario', FORM, 2)] });
    await put(n.token, `/funnels/${funnel.id}/type-config`, THANKS);
    return { ...n, funnel };
  }

  const guardar = async (token: string, funnelId: string, label: string) => (await post(token, `/funnels/${funnelId}/history`, { label })).body as { id: string; label: string };
  const titulo = async (funnelId: string) => {
    const funnel = await prisma.funnel.findUniqueOrThrow({ where: { id: funnelId } });
    return (funnel.content as { blocks: { content: { title?: string } }[] }).blocks[0]?.content.title;
  };
  const claves = async (funnelId: string) => (await prisma.cTA.findMany({ where: { funnelId }, orderBy: { blockKey: 'asc' } })).map((cta) => cta.blockKey);

  describe('POST /funnels/:id/history', () => {
    it('guarda una copia de la página con su nombre y quién la guardó, y no devuelve la copia', async () => {
      const { token, funnel, email } = await funnelListo();
      await put(token, `/funnels/${funnel.id}/design-spec`, PLANTILLA);
      const res = await post(token, `/funnels/${funnel.id}/history`, { label: '  Antes de la oferta  ' });

      expect(res.status).toBe(201);
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(res.body).toEqual({
        id: expect.any(String),
        funnelId: funnel.id,
        label: 'Antes de la oferta',
        createdAt: expect.any(String),
        user: { id: usuario.id, name: usuario.name, email },
      });

      const guardada = await prisma.funnelHistory.findUniqueOrThrow({ where: { id: res.body.id } });
      const actual = await prisma.funnel.findUniqueOrThrow({ where: { id: funnel.id } });
      expect(guardada.snapshot).toEqual({ content: actual.content, designSpec: actual.designSpec, brandBrief: null, seo: null, flow: null });
      expect(await prisma.auditLog.count({ where: { action: 'funnel.history_save', resourceId: funnel.id } })).toBe(1);
    });

    it('un nombre vacío, de espacios, demasiado largo o ausente responde 422 y no guarda nada', async () => {
      const { token, funnel } = await funnelListo();
      for (const body of [{ label: '' }, { label: '   ' }, { label: 'a'.repeat(121) }, {}, { label: 7 }]) {
        const res = await post(token, `/funnels/${funnel.id}/history`, body);
        expect(res.status, JSON.stringify(body)).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(await prisma.funnelHistory.count({ where: { funnelId: funnel.id } })).toBe(0);
      expect((await post(token, `/funnels/${funnel.id}/history`, { label: 'a'.repeat(120) })).status).toBe(201);
    });
  });

  describe('GET /funnels/:id/history', () => {
    it('lista de la más nueva a la más vieja, con la versión «Publicado», sin la copia y con paginación', async () => {
      const { token, funnel } = await funnelListo();
      await post(token, `/funnels/${funnel.id}/publish`);
      // Cinco versiones: con tantas, un orden por casualidad es casi imposible.
      for (const nombre of ['Primera', 'Segunda', 'Tercera', 'Cuarta']) {
        await new Promise((resolver) => setTimeout(resolver, 5));
        await guardar(token, funnel.id, nombre);
      }

      const res = await get(token, `/funnels/${funnel.id}/history`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 5, page: 1, pageSize: 25 });
      expect(res.body.items.map((item: { label: string }) => item.label)).toEqual(['Cuarta', 'Tercera', 'Segunda', 'Primera', 'Publicado']);
      expect(res.body.items[0]).not.toHaveProperty('snapshot');
      expect(res.body.items[0].user.email).toEqual(expect.any(String));

      const pagina = await get(token, `/funnels/${funnel.id}/history?pageSize=2&page=2`);
      expect(pagina.body.items.map((item: { label: string }) => item.label)).toEqual(['Segunda', 'Primera']);
      expect(pagina.body).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    });

    it('un funnel sin versiones responde una lista vacía; solo ve las de su funnel', async () => {
      const a = await funnelListo();
      const b = await funnelListo();
      await guardar(b.token, b.funnel.id, 'De b');
      expect((await get(a.token, `/funnels/${a.funnel.id}/history`)).body).toMatchObject({ items: [], total: 0 });
    });
  });

  describe('POST /funnels/:id/history/:historyId/restore', () => {
    it('devuelve la página a como estaba, deja los CTA de esos bloques y guarda antes cómo estaba para poder deshacer', async () => {
      const { token, funnel } = await funnelListo();
      await put(token, `/funnels/${funnel.id}/design-spec`, PLANTILLA);
      const original = await guardar(token, funnel.id, 'Buena');
      expect(await claves(funnel.id)).toEqual(['form']);

      // La página cambia: otro título, otro bloque (con su CTA), sin el formulario, otro diseño y SEO.
      await put(token, `/funnels/${funnel.id}/content`, { blocks: [bloque('hero', 'encabezado', { title: 'Versión dos' }, 1), bloque('mas', 'boton', { label: 'Más' }, 2)] });
      await put(token, `/funnels/${funnel.id}/design-spec`, { template: 'bold' });
      await patch(token, `/funnels/${funnel.id}`, { seo: { title: 'Nuevo título' } });
      expect(await claves(funnel.id)).toEqual(['mas']);

      const res = await post(token, `/funnels/${funnel.id}/history/${original.id}/restore`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(funnel.id);
      expect(res.body.content.blocks.map((b: { key: string }) => b.key)).toEqual(['hero', 'form']);
      expect(res.body.designSpec).toEqual(PLANTILLA);
      expect(res.body.seo).toBeNull();
      expect(res.body.price).toBe(100);
      expect(await titulo(funnel.id)).toBe('Versión uno');
      expect(await claves(funnel.id)).toEqual(['form']);

      // Antes de restaurar guardó cómo estaba la página, y esa versión se puede volver a restaurar.
      const lista = (await get(token, `/funnels/${funnel.id}/history`)).body.items as { id: string; label: string }[];
      expect(lista[0]?.label).toBe('Antes de restaurar «Buena»');
      expect(lista).toHaveLength(2);
      await post(token, `/funnels/${funnel.id}/history/${lista[0]?.id}/restore`);
      expect(await titulo(funnel.id)).toBe('Versión dos');
      expect(await claves(funnel.id)).toEqual(['mas']);
      expect(((await prisma.funnel.findUniqueOrThrow({ where: { id: funnel.id } })).seo as { title: string }).title).toBe('Nuevo título');
      expect(await prisma.auditLog.count({ where: { action: 'funnel.history_restore', resourceId: funnel.id } })).toBe(2);
    });

    it('no toca el nombre, el precio, la divisa, el slug ni los ajustes del tipo, y la página publicada cambia al instante', async () => {
      const { token, funnel } = await funnelListo();
      await post(token, `/funnels/${funnel.id}/publish`);
      const publicada = (await get(token, `/funnels/${funnel.id}/history`)).body.items[0] as { id: string };

      await put(token, `/funnels/${funnel.id}/content`, { blocks: [bloque('hero', 'encabezado', { title: 'Versión dos' }, 1), bloque('form', 'formulario', FORM, 2)] });
      await patch(token, `/funnels/${funnel.id}`, { name: 'Otro nombre', price: 999, currency: 'USD' });
      await put(token, `/funnels/${funnel.id}/type-config`, { thankYou: { message: 'Otro mensaje' } });
      expect((await request(app).get(`/api/v1/public/pages/${funnel.slug}`)).body.content.blocks[0].content.title).toBe('Versión dos');

      const res = await post(token, `/funnels/${funnel.id}/history/${publicada.id}/restore`);
      expect(res.body).toMatchObject({ name: 'Otro nombre', price: 999, currency: 'USD', slug: funnel.slug, status: 'published', typeConfig: { thankYou: { message: 'Otro mensaje' } } });
      expect((await request(app).get(`/api/v1/public/pages/${funnel.slug}`)).body.content.blocks[0].content.title).toBe('Versión uno');
    });

    it('conserva el destino que se editó en un CTA que sigue existiendo', async () => {
      const { token, funnel } = await funnelListo();
      await put(token, `/funnels/${funnel.id}/content`, { blocks: [bloque('mas', 'boton', { label: 'Más' }, 1)] });
      const antes = await guardar(token, funnel.id, 'Con botón');
      await patch(token, `/funnels/${funnel.id}/ctas/mas`, { actionType: 'url', destination: 'https://ejemplo.com/info' });
      await put(token, `/funnels/${funnel.id}/content`, { blocks: [bloque('mas', 'boton', { label: 'Más' }, 1), bloque('otro', 'boton', { label: 'Otro' }, 2)] });

      await post(token, `/funnels/${funnel.id}/history/${antes.id}/restore`);
      expect(await claves(funnel.id)).toEqual(['mas']);
      expect(await prisma.cTA.findFirstOrThrow({ where: { funnelId: funnel.id, blockKey: 'mas' } })).toMatchObject({ actionType: 'url', destination: 'https://ejemplo.com/info' });
    });

    it('una versión sin nombre se explica en la copia de respaldo y el nombre largo se recorta a 120', async () => {
      const { token, funnel, email } = await funnelListo();
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
      const actual = await prisma.funnel.findUniqueOrThrow({ where: { id: funnel.id } });
      const snapshot = { content: actual.content };
      const sinNombre = await prisma.funnelHistory.create({ data: { funnelId: funnel.id, userId: usuario.id, label: null, snapshot } });
      const largo = await prisma.funnelHistory.create({ data: { funnelId: funnel.id, userId: usuario.id, label: 'x'.repeat(120), snapshot } });

      await post(token, `/funnels/${funnel.id}/history/${sinNombre.id}/restore`);
      await post(token, `/funnels/${funnel.id}/history/${largo.id}/restore`);
      const etiquetas = (await prisma.funnelHistory.findMany({ where: { funnelId: funnel.id }, orderBy: { createdAt: 'asc' } })).map((e) => e.label);
      expect(etiquetas).toContain('Antes de restaurar una versión sin nombre');
      expect(etiquetas.at(-1)).toHaveLength(120);
      expect(etiquetas.at(-1)?.startsWith('Antes de restaurar «xxx')).toBe(true);
    });

    it('una copia incompleta o dañada no tumba la restauración: solo cambia lo que trae', async () => {
      const { token, funnel, email } = await funnelListo();
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
      await patch(token, `/funnels/${funnel.id}`, { seo: { title: 'Mi título' } });
      const crear = (snapshot: object) => prisma.funnelHistory.create({ data: { funnelId: funnel.id, userId: usuario.id, label: 'rara', snapshot } });

      for (const snapshot of [[], {}, { content: null }, 'texto', 7]) {
        const rara = await crear(snapshot as object);
        const res = await post(token, `/funnels/${funnel.id}/history/${rara.id}/restore`);
        expect(res.status, JSON.stringify(snapshot)).toBe(200);
        expect(res.body.content.blocks).toHaveLength(2);
        expect(res.body.seo).toEqual({ title: 'Mi título' });
      }
      // Una copia con `seo: null` sí lo borra.
      const conNulo = await crear({ seo: null });
      expect((await post(token, `/funnels/${funnel.id}/history/${conNulo.id}/restore`)).body.seo).toBeNull();
    });

    it('una versión de otro funnel, inexistente o con id inválido no se restaura', async () => {
      const a = await funnelListo();
      const b = await funnelListo();
      const deB = await guardar(b.token, b.funnel.id, 'De b');
      await put(a.token, `/funnels/${a.funnel.id}/content`, { blocks: [bloque('hero', 'encabezado', { title: 'Cambiado' }, 1)] });

      const ajena = await post(a.token, `/funnels/${a.funnel.id}/history/${deB.id}/restore`);
      expect(ajena.status).toBe(404);
      expect(ajena.body.error.code).toBe('HISTORY_NOT_FOUND');
      expect((await post(a.token, `/funnels/${a.funnel.id}/history/6c5b9f4e-6b0e-4a43-9d3b-0c1f4f3b7a11/restore`)).status).toBe(404);
      expect((await post(a.token, `/funnels/${a.funnel.id}/history/no-es-un-id/restore`)).status).toBe(422);
      expect(await titulo(a.funnel.id)).toBe('Cambiado');
      expect(await prisma.funnelHistory.count({ where: { funnelId: a.funnel.id } })).toBe(0);
    });
  });

  describe('permisos', () => {
    it('el diseñador ve y guarda versiones pero no restaura; el marketing manager hace las tres cosas', async () => {
      const f = await funnelListo();
      const disenador = await miembro(f.workspace.id, 'disenador');
      const marketing = await miembro(f.workspace.id, 'marketing_manager');
      const version = await guardar(f.token, f.funnel.id, 'Base');

      expect((await get(disenador.token, `/funnels/${f.funnel.id}/history`)).status).toBe(200);
      expect((await post(disenador.token, `/funnels/${f.funnel.id}/history`, { label: 'Del diseñador' })).status).toBe(201);
      expect((await post(disenador.token, `/funnels/${f.funnel.id}/history/${version.id}/restore`)).status).toBe(403);
      expect(await prisma.funnelHistory.count({ where: { funnelId: f.funnel.id } })).toBe(2);

      expect((await get(marketing.token, `/funnels/${f.funnel.id}/history`)).status).toBe(200);
      expect((await post(marketing.token, `/funnels/${f.funnel.id}/history`, { label: 'Del marketing' })).status).toBe(201);
      expect((await post(marketing.token, `/funnels/${f.funnel.id}/history/${version.id}/restore`)).status).toBe(200);
    });

    it('el vendedor y el analista no pueden ver, guardar ni restaurar (403)', async () => {
      const f = await funnelListo();
      const version = await guardar(f.token, f.funnel.id, 'Base');
      for (const role of ['vendedor', 'analista'] as const) {
        const persona = await miembro(f.workspace.id, role);
        expect((await get(persona.token, `/funnels/${f.funnel.id}/history`)).status, role).toBe(403);
        expect((await post(persona.token, `/funnels/${f.funnel.id}/history`, { label: 'x' })).status, role).toBe(403);
        expect((await post(persona.token, `/funnels/${f.funnel.id}/history/${version.id}/restore`)).status, role).toBe(403);
      }
      expect(await prisma.funnelHistory.count({ where: { funnelId: f.funnel.id } })).toBe(1);
    });

    it('un funnel de otro cliente responde 404 en las tres y sin sesión 401', async () => {
      const f = await funnelListo();
      const version = await guardar(f.token, f.funnel.id, 'Base');
      const ajeno = await crearNegocio(app, config);
      expect((await get(ajeno.token, `/funnels/${f.funnel.id}/history`)).status).toBe(404);
      expect((await post(ajeno.token, `/funnels/${f.funnel.id}/history`, { label: 'x' })).status).toBe(404);
      expect((await post(ajeno.token, `/funnels/${f.funnel.id}/history/${version.id}/restore`)).status).toBe(404);
      expect(await prisma.funnelHistory.count({ where: { funnelId: f.funnel.id } })).toBe(1);

      expect((await request(app).get(`/api/v1/funnels/${f.funnel.id}/history`)).status).toBe(401);
      expect((await request(app).post(`/api/v1/funnels/${f.funnel.id}/history`).send({ label: 'x' })).status).toBe(401);
      expect((await request(app).post(`/api/v1/funnels/${f.funnel.id}/history/${version.id}/restore`)).status).toBe(401);
    });
  });
});
