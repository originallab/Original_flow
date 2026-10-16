import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './helpers/db.js';
import { agregarMiembro, crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

const FORM = { fields: [{ name: 'email', label: 'Correo', type: 'email', required: true }], submitLabel: 'Quiero info' };
const bloque = (key: string, type: string, content: object, order = 1) => ({ key, type, order, content, style: {} });

describe.skipIf(!testDatabaseUrl)('funnels', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const get = (token: string, ruta: string) => request(app).get(`/api/v1${ruta}`).set(encabezados(token));
  const post = (token: string, ruta: string, body: object) => request(app).post(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const put = (token: string, ruta: string, body: object) => request(app).put(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const patch = (token: string, ruta: string, body: object) => request(app).patch(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const del = (token: string, ruta: string) => request(app).delete(`/api/v1${ruta}`).set(encabezados(token));

  const negocio = () => crearNegocio(app, config);
  const miembro = (workspaceId: string, role: Parameters<typeof agregarMiembro>[4]) => agregarMiembro(app, prisma, config, workspaceId, role);

  /** Un negocio con un funnel ya creado. */
  async function conFunnel(objective = 'venta', extra: object = {}) {
    const n = await negocio();
    const res = await post(n.token, '/funnels', { workspaceId: n.workspace.id, name: 'Curso de datos', objective, ...extra });
    return { ...n, funnel: res.body as { id: string; slug: string } };
  }

  describe('GET /funnel-types', () => {
    it('sin sesión responde 401', async () => {
      expect((await request(app).get('/api/v1/funnel-types')).status).toBe(401);
    });

    it('lista los 8 tipos con su esquema de typeConfig para cualquier persona autenticada', async () => {
      const { token } = await negocio();
      const res = await get(token, '/funnel-types');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(8);
      const venta = res.body.items.find((t: { id: string }) => t.id === 'venta');
      expect(venta).toMatchObject({ charges: true, available: true, primaryCta: 'checkout', conversionEvent: 'payment_completed' });
      expect(venta.typeConfigSchema.type).toBe('object');
    });
  });

  describe('POST /funnels', () => {
    it('crea un funnel en borrador con slug automático, divisa por defecto y contenido vacío', async () => {
      const n = await negocio();
      const res = await post(n.token, '/funnels', {
        workspaceId: n.workspace.id,
        name: 'Curso de Análisis de Datos',
        objective: 'leads',
        productName: 'Curso',
        price: 4200,
        targetAudience: 'Profesionales',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'draft',
        objective: 'leads',
        language: 'es',
        currency: 'MXN',
        price: 4200,
        content: { blocks: [] },
        typeConfig: null,
      });
      expect(res.body.slug).toMatch(/^curso-de-analisis-de-datos/);
      expect(await prisma.auditLog.count({ where: { action: 'funnel.create', resourceId: res.body.id } })).toBe(1);
    });

    it('dos funnels con el mismo nombre reciben slugs distintos', async () => {
      const n = await negocio();
      const body = { workspaceId: n.workspace.id, name: 'Mismo Nombre', objective: 'leads' };
      const a = await post(n.token, '/funnels', body);
      const b = await post(n.token, '/funnels', body);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.slug).not.toBe(b.body.slug);
    });

    it('rechaza los tipos no disponibles (upsell y libre) con 422', async () => {
      const n = await negocio();
      for (const objective of ['upsell', 'libre']) {
        const res = await post(n.token, '/funnels', { workspaceId: n.workspace.id, name: 'Futuro', objective });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('FUNNEL_TYPE_UNAVAILABLE');
      }
    });

    it('rechaza un tipo inventado, un nombre vacío y una divisa no soportada con 422', async () => {
      const n = await negocio();
      const base = { workspaceId: n.workspace.id, name: 'X', objective: 'leads' };
      expect((await post(n.token, '/funnels', { ...base, objective: 'otro' })).status).toBe(422);
      expect((await post(n.token, '/funnels', { ...base, name: '' })).status).toBe(422);
      expect((await post(n.token, '/funnels', { ...base, currency: 'EUR' })).status).toBe(422);
    });

    it('el diseñador puede crear; el vendedor y el analista reciben 403', async () => {
      const n = await negocio();
      const body = { workspaceId: n.workspace.id, name: 'Prueba', objective: 'leads' };
      expect((await post((await miembro(n.workspace.id, 'disenador')).token, '/funnels', body)).status).toBe(201);
      expect((await post((await miembro(n.workspace.id, 'vendedor')).token, '/funnels', body)).status).toBe(403);
      expect((await post((await miembro(n.workspace.id, 'analista')).token, '/funnels', body)).status).toBe(403);
    });

    it('en un workspace de otro cliente responde 404 y no crea nada', async () => {
      const mio = await negocio();
      const ajeno = await negocio();
      const res = await post(mio.token, '/funnels', { workspaceId: ajeno.workspace.id, name: 'Intruso', objective: 'leads' });
      expect(res.status).toBe(404);
      expect(await prisma.funnel.count({ where: { workspaceId: ajeno.workspace.id } })).toBe(0);
    });
  });

  describe('GET /funnels', () => {
    it('lista los funnels del workspace sin el contenido pesado, con paginación y filtro por estado', async () => {
      const n = await negocio();
      await post(n.token, '/funnels', { workspaceId: n.workspace.id, name: 'Uno', objective: 'leads' });
      const dos = await post(n.token, '/funnels', { workspaceId: n.workspace.id, name: 'Dos', objective: 'citas' });
      await prisma.funnel.update({ where: { id: dos.body.id }, data: { status: 'published' } });

      const todos = await get(n.token, `/funnels?workspaceId=${n.workspace.id}`);
      expect(todos.body).toMatchObject({ total: 2, page: 1, pageSize: 25 });
      expect(todos.body.items[0]).not.toHaveProperty('content');
      expect(todos.body.items[0]).not.toHaveProperty('typeConfig');

      const publicados = await get(n.token, `/funnels?workspaceId=${n.workspace.id}&status=published`);
      expect(publicados.body.items.map((f: { id: string }) => f.id)).toEqual([dos.body.id]);

      const pagina = await get(n.token, `/funnels?workspaceId=${n.workspace.id}&pageSize=1&page=2`);
      expect(pagina.body.items).toHaveLength(1);
    });

    it('todos los roles ven la lista, incluido el analista', async () => {
      const n = await negocio();
      const analista = await miembro(n.workspace.id, 'analista');
      expect((await get(analista.token, `/funnels?workspaceId=${n.workspace.id}`)).status).toBe(200);
    });

    it('sin workspaceId responde 422; de otro cliente, 404', async () => {
      const mio = await negocio();
      const ajeno = await negocio();
      expect((await get(mio.token, '/funnels')).status).toBe(422);
      expect((await get(mio.token, `/funnels?workspaceId=${ajeno.workspace.id}`)).status).toBe(404);
    });
  });

  describe('GET /funnels/:id', () => {
    it('devuelve el funnel completo a quien puede editarlo', async () => {
      const { token, funnel } = await conFunnel();
      const res = await get(token, `/funnels/${funnel.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('content');
      expect(res.body).toHaveProperty('designSpec');
    });

    it('el vendedor y el analista no abren el funnel completo (403)', async () => {
      const { workspace, funnel } = await conFunnel();
      for (const role of ['vendedor', 'analista'] as const) {
        expect((await get((await miembro(workspace.id, role)).token, `/funnels/${funnel.id}`)).status).toBe(403);
      }
    });

    it('un funnel de otro cliente responde 404, igual que uno inexistente', async () => {
      const mio = await negocio();
      const ajeno = await conFunnel();
      const delAjeno = await get(mio.token, `/funnels/${ajeno.funnel.id}`);
      const inexistente = await get(mio.token, `/funnels/${randomUUID()}`);
      expect(delAjeno.status).toBe(404);
      expect(delAjeno.body.error).toEqual(inexistente.body.error);
    });

    it('un id que no es UUID responde 422', async () => {
      const { token } = await negocio();
      expect((await get(token, '/funnels/abc')).status).toBe(422);
    });
  });

  describe('PATCH /funnels/:id', () => {
    it('cambia nombre, producto, precio, divisa, público, slug, seo e idioma, y queda auditado', async () => {
      const { token, funnel } = await conFunnel();
      const res = await patch(token, `/funnels/${funnel.id}`, {
        name: 'Nuevo nombre',
        productName: 'Producto',
        price: 999.5,
        currency: 'USD',
        targetAudience: 'Todos',
        slug: `nuevo-${randomUUID().slice(0, 6)}`,
        seo: { title: 'Título', description: 'Descripción', indexable: true },
        language: 'en',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Nuevo nombre', price: 999.5, currency: 'USD', language: 'en', seo: { title: 'Título', indexable: true } });
      const auditoria = await prisma.auditLog.findFirstOrThrow({ where: { action: 'funnel.update', resourceId: funnel.id } });
      expect((auditoria.metadata as { fields: string[] }).fields).toContain('slug');
    });

    it('con null borra campos opcionales como el precio y el seo', async () => {
      const { token, funnel } = await conFunnel('venta', { price: 100 });
      await patch(token, `/funnels/${funnel.id}`, { seo: { title: 'x' } });
      const res = await patch(token, `/funnels/${funnel.id}`, { price: null, seo: null });
      expect(res.body).toMatchObject({ price: null, seo: null });
    });

    it('un slug usado por otro funnel responde 409', async () => {
      const a = await conFunnel();
      const b = await conFunnel();
      const res = await patch(b.token, `/funnels/${b.funnel.id}`, { slug: a.funnel.slug });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SLUG_TAKEN');
    });

    it('rechaza un slug inválido, un cuerpo vacío y campos que no se editan por aquí', async () => {
      const { token, funnel } = await conFunnel();
      expect((await patch(token, `/funnels/${funnel.id}`, { slug: 'Mayúsculas y espacios' })).status).toBe(422);
      expect((await patch(token, `/funnels/${funnel.id}`, {})).status).toBe(422);
      expect((await patch(token, `/funnels/${funnel.id}`, { status: 'published' })).status).toBe(422);
      expect((await prisma.funnel.findUniqueOrThrow({ where: { id: funnel.id } })).status).toBe('draft');
    });

    it('el vendedor recibe 403 y un funnel ajeno 404', async () => {
      const { workspace, funnel } = await conFunnel();
      const vendedor = await miembro(workspace.id, 'vendedor');
      expect((await patch(vendedor.token, `/funnels/${funnel.id}`, { name: 'x' })).status).toBe(403);
      const otro = await negocio();
      expect((await patch(otro.token, `/funnels/${funnel.id}`, { name: 'x' })).status).toBe(404);
    });
  });

  describe('DELETE /funnels/:id', () => {
    it('el administrador lo elimina con sus CTA y queda auditado', async () => {
      const { token, funnel } = await conFunnel('leads');
      await put(token, `/funnels/${funnel.id}/content`, { blocks: [bloque('form', 'formulario', FORM)] });
      expect((await del(token, `/funnels/${funnel.id}`)).status).toBe(204);
      expect(await prisma.funnel.count({ where: { id: funnel.id } })).toBe(0);
      expect(await prisma.cTA.count({ where: { funnelId: funnel.id } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { action: 'funnel.delete', resourceId: funnel.id } })).toBe(1);
    });

    it('un funnel con órdenes responde 409 y no se borra', async () => {
      const { token, funnel } = await conFunnel();
      await prisma.order.create({
        data: { funnelId: funnel.id, orderNumber: `OF-${randomUUID().slice(0, 8)}`, amount: 100, currency: 'MXN', customerEmail: 'a@b.com' },
      });
      const res = await del(token, `/funnels/${funnel.id}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('FUNNEL_HAS_ORDERS');
      expect(await prisma.funnel.count({ where: { id: funnel.id } })).toBe(1);
    });

    it('el marketing manager recibe 403 y no borra nada', async () => {
      const { workspace, funnel } = await conFunnel();
      const mm = await miembro(workspace.id, 'marketing_manager');
      expect((await del(mm.token, `/funnels/${funnel.id}`)).status).toBe(403);
      expect(await prisma.funnel.count({ where: { id: funnel.id } })).toBe(1);
    });
  });

  describe('PUT /funnels/:id/content y sincronización de CTA', () => {
    it('guarda los bloques y crea un CTA por cada botón y formulario, con la acción por defecto', async () => {
      const { token, funnel } = await conFunnel('venta');
      const res = await put(token, `/funnels/${funnel.id}/content`, {
        blocks: [
          bloque('hero', 'encabezado', { title: 'Hola' }, 1),
          bloque('comprar', 'boton', { label: 'Comprar ya' }, 2),
          bloque('form', 'formulario', FORM, 3),
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.blocks.map((b: { key: string }) => b.key)).toEqual(['hero', 'comprar', 'form']);

      const ctas = (await get(token, `/funnels/${funnel.id}/ctas`)).body as { blockKey: string; label: string; actionType: string }[];
      expect(ctas.map((c) => [c.blockKey, c.label, c.actionType])).toEqual([
        ['comprar', 'Comprar ya', 'checkout'],
        ['form', 'Quiero info', 'form_submit'],
      ]);
    });

    it('en un funnel que no cobra el botón nace con scroll_to', async () => {
      const { token, funnel } = await conFunnel('leads');
      await put(token, `/funnels/${funnel.id}/content`, { blocks: [bloque('cta', 'boton', { label: 'Ver más' })] });
      const [cta] = (await get(token, `/funnels/${funnel.id}/ctas`)).body;
      expect(cta.actionType).toBe('scroll_to');
    });

    it('al volver a guardar elimina los CTA de bloques que ya no están y conserva el destino editado', async () => {
      const { token, funnel } = await conFunnel('leads');
      await put(token, `/funnels/${funnel.id}/content`, {
        blocks: [bloque('a', 'boton', { label: 'A' }, 1), bloque('b', 'boton', { label: 'B' }, 2)],
      });
      await patch(token, `/funnels/${funnel.id}/ctas/a`, { actionType: 'url', destination: 'https://ejemplo.com/a', trackingId: 'cta-a' });

      await put(token, `/funnels/${funnel.id}/content`, { blocks: [bloque('a', 'boton', { label: 'A nueva' }, 1)] });
      const ctas = (await get(token, `/funnels/${funnel.id}/ctas`)).body;
      expect(ctas).toHaveLength(1);
      expect(ctas[0]).toMatchObject({ blockKey: 'a', label: 'A nueva', actionType: 'url', destination: 'https://ejemplo.com/a', trackingId: 'cta-a' });
    });

    it('si un bloque cambia de botón a formulario, su CTA se reinicia a form_submit', async () => {
      const { token, funnel } = await conFunnel('leads');
      await put(token, `/funnels/${funnel.id}/content`, { blocks: [bloque('x', 'boton', { label: 'X' })] });
      await patch(token, `/funnels/${funnel.id}/ctas/x`, { actionType: 'url', destination: 'https://ejemplo.com' });
      await put(token, `/funnels/${funnel.id}/content`, { blocks: [bloque('x', 'formulario', FORM)] });
      const [cta] = (await get(token, `/funnels/${funnel.id}/ctas`)).body;
      expect(cta).toMatchObject({ actionType: 'form_submit', destination: null });
    });

    it('rechaza con 422 un tipo de bloque inventado, claves repetidas y contenido inválido, sin guardar nada', async () => {
      const { token, funnel } = await conFunnel();
      const malos = [
        [bloque('a', 'inventado', { title: 'x' })],
        [bloque('a', 'encabezado', { title: 'x' }), bloque('a', 'texto', { body: 'y' }, 2)],
        [bloque('a', 'encabezado', {})],
        [bloque('a', 'formulario', { fields: [], submitLabel: 'x' })],
      ];
      for (const blocks of malos) {
        const res = await put(token, `/funnels/${funnel.id}/content`, { blocks });
        expect(res.status).toBe(422);
      }
      const actual = await prisma.funnel.findUniqueOrThrow({ where: { id: funnel.id } });
      expect(actual.content).toEqual({ blocks: [] });
    });

    it('el error de contenido indica en qué bloque y campo está el problema', async () => {
      const { token, funnel } = await conFunnel();
      const res = await put(token, `/funnels/${funnel.id}/content`, { blocks: [bloque('hero', 'encabezado', {})] });
      expect(res.body.error.details[0].path).toBe('blocks.0.content.title');
    });

    it('acepta una página con hasta 60 bloques y rechaza 61', async () => {
      const { token, funnel } = await conFunnel();
      const crear = (n: number) => Array.from({ length: n }, (_, i) => bloque(`b${i}`, 'texto', { body: 'x' }, i + 1));
      expect((await put(token, `/funnels/${funnel.id}/content`, { blocks: crear(60) })).status).toBe(200);
      expect((await put(token, `/funnels/${funnel.id}/content`, { blocks: crear(61) })).status).toBe(422);
    });

    it('el vendedor recibe 403 y un funnel ajeno 404', async () => {
      const { workspace, funnel } = await conFunnel();
      const vendedor = await miembro(workspace.id, 'vendedor');
      expect((await put(vendedor.token, `/funnels/${funnel.id}/content`, { blocks: [] })).status).toBe(403);
      const otro = await negocio();
      expect((await put(otro.token, `/funnels/${funnel.id}/content`, { blocks: [] })).status).toBe(404);
    });

    it('el autoguardado no escribe en el log de auditoría', async () => {
      const { token, funnel } = await conFunnel();
      await put(token, `/funnels/${funnel.id}/content`, { blocks: [bloque('a', 'texto', { body: 'x' })] });
      expect(await prisma.auditLog.count({ where: { resourceId: funnel.id, action: { contains: 'content' } } })).toBe(0);
    });
  });

  describe('PATCH /funnels/:id/content/blocks/:key', () => {
    async function conBloques() {
      const f = await conFunnel('leads');
      await put(f.token, `/funnels/${f.funnel.id}/content`, {
        blocks: [bloque('hero', 'encabezado', { title: 'Original' }, 1), bloque('cta', 'boton', { label: 'Botón' }, 2)],
      });
      return f;
    }

    it('edita solo ese bloque y deja los demás igual', async () => {
      const { token, funnel } = await conBloques();
      const res = await patch(token, `/funnels/${funnel.id}/content/blocks/hero`, { content: { title: 'Editado' }, order: 5 });
      expect(res.status).toBe(200);
      const hero = res.body.blocks.find((b: { key: string }) => b.key === 'hero');
      expect(hero).toMatchObject({ type: 'encabezado', order: 5, content: { title: 'Editado' } });
      expect(res.body.blocks.find((b: { key: string }) => b.key === 'cta').content.label).toBe('Botón');
    });

    it('si cambia el texto de un botón, actualiza la etiqueta de su CTA', async () => {
      const { token, funnel } = await conBloques();
      await patch(token, `/funnels/${funnel.id}/content/blocks/cta`, { content: { label: 'Nuevo texto' } });
      const [cta] = (await get(token, `/funnels/${funnel.id}/ctas`)).body;
      expect(cta.label).toBe('Nuevo texto');
    });

    it('un contenido inválido para el tipo del bloque responde 422 y no cambia nada', async () => {
      const { token, funnel } = await conBloques();
      const res = await patch(token, `/funnels/${funnel.id}/content/blocks/hero`, { content: { subtitle: 'sin título' } });
      expect(res.status).toBe(422);
      const actual = await get(token, `/funnels/${funnel.id}`);
      expect(actual.body.content.blocks[0].content.title).toBe('Original');
    });

    it('un bloque que no existe responde 404; un cuerpo vacío, 422', async () => {
      const { token, funnel } = await conBloques();
      expect((await patch(token, `/funnels/${funnel.id}/content/blocks/nada`, { order: 2 })).status).toBe(404);
      expect((await patch(token, `/funnels/${funnel.id}/content/blocks/hero`, {})).status).toBe(422);
    });
  });

  describe('PUT /funnels/:id/type-config', () => {
    it('guarda la configuración válida del tipo y queda auditado', async () => {
      const { token, funnel } = await conFunnel('citas');
      const config = { calendarUrl: 'https://cal.ejemplo.com/yo', durationMin: 30, confirmationMessage: 'Listo' };
      const res = await put(token, `/funnels/${funnel.id}/type-config`, config);
      expect(res.status).toBe(200);
      expect(res.body.typeConfig).toEqual(config);
      expect((await get(token, `/funnels/${funnel.id}`)).body.typeConfig).toEqual(config);
      expect(await prisma.auditLog.count({ where: { action: 'funnel.type_config_update', resourceId: funnel.id } })).toBe(1);
    });

    it('rechaza con 422 una configuración que no cumple el esquema de su tipo, sin guardar', async () => {
      const { token, funnel } = await conFunnel('citas');
      const res = await put(token, `/funnels/${funnel.id}/type-config`, { calendarUrl: 'no-es-url', durationMin: 1 });
      expect(res.status).toBe(422);
      expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['calendarUrl', 'confirmationMessage', 'durationMin']);
      expect((await prisma.funnel.findUniqueOrThrow({ where: { id: funnel.id } })).typeConfig).toBeNull();
    });

    it('la configuración de otro tipo no es válida (venta no acepta la de citas)', async () => {
      const { token, funnel } = await conFunnel('venta');
      const res = await put(token, `/funnels/${funnel.id}/type-config`, { calendarUrl: 'https://x.com', durationMin: 30, confirmationMessage: 'x' });
      expect(res.status).toBe(422);
    });

    it('venta no guarda un precio dentro de typeConfig', async () => {
      const { token, funnel } = await conFunnel('venta');
      const res = await put(token, `/funnels/${funnel.id}/type-config`, { paymentMethods: ['stripe'], successMessage: 'Gracias', price: 5 });
      expect(res.body.typeConfig).not.toHaveProperty('price');
    });

    it('el vendedor recibe 403 y un funnel ajeno 404', async () => {
      const { workspace, funnel } = await conFunnel('leads');
      const vendedor = await miembro(workspace.id, 'vendedor');
      const config = { thankYou: { message: 'Gracias' } };
      expect((await put(vendedor.token, `/funnels/${funnel.id}/type-config`, config)).status).toBe(403);
      expect((await put((await negocio()).token, `/funnels/${funnel.id}/type-config`, config)).status).toBe(404);
    });
  });

  describe('PATCH /funnels/:id/ctas/:blockKey', () => {
    async function conCtas(objective: string) {
      const f = await conFunnel(objective);
      await put(f.token, `/funnels/${f.funnel.id}/content`, {
        blocks: [bloque('boton', 'boton', { label: 'Botón' }, 1), bloque('form', 'formulario', FORM, 2)],
      });
      return f;
    }

    it('cambia destino, tipo de acción y seguimiento, y queda auditado', async () => {
      const { token, funnel } = await conCtas('leads');
      const res = await patch(token, `/funnels/${funnel.id}/ctas/boton`, { actionType: 'url', destination: 'https://ejemplo.com', trackingId: 'hero-cta' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ actionType: 'url', destination: 'https://ejemplo.com', trackingId: 'hero-cta' });
      expect(await prisma.auditLog.count({ where: { action: 'cta.update', resourceId: res.body.id } })).toBe(1);
    });

    it('un destino de enlace que no es una URL http responde 422', async () => {
      const { token, funnel } = await conCtas('leads');
      const res = await patch(token, `/funnels/${funnel.id}/ctas/boton`, { actionType: 'url', destination: 'javascript:alert(1)' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('CTA_DESTINATION_INVALID');
    });

    it('un funnel que no cobra no puede tener un CTA de checkout', async () => {
      const { token, funnel } = await conCtas('leads');
      const res = await patch(token, `/funnels/${funnel.id}/ctas/boton`, { actionType: 'checkout' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('CTA_CHECKOUT_NOT_ALLOWED');
    });

    it('un funnel de venta sí permite checkout', async () => {
      const { token, funnel } = await conCtas('venta');
      expect((await patch(token, `/funnels/${funnel.id}/ctas/boton`, { actionType: 'checkout' })).status).toBe(200);
    });

    it('un formulario solo puede ser form_submit y un botón no puede serlo', async () => {
      const { token, funnel } = await conCtas('leads');
      const formulario = await patch(token, `/funnels/${funnel.id}/ctas/form`, { actionType: 'url', destination: 'https://ejemplo.com' });
      const boton = await patch(token, `/funnels/${funnel.id}/ctas/boton`, { actionType: 'form_submit' });
      expect(formulario.body.error.code).toBe('CTA_ACTION_NOT_ALLOWED');
      expect(boton.body.error.code).toBe('CTA_ACTION_NOT_ALLOWED');
    });

    it('al cambiar la acción sin mandar destino, el destino anterior se borra', async () => {
      const { token, funnel } = await conCtas('leads');
      await patch(token, `/funnels/${funnel.id}/ctas/boton`, { actionType: 'url', destination: 'https://ejemplo.com' });
      const res = await patch(token, `/funnels/${funnel.id}/ctas/boton`, { actionType: 'scroll_to' });
      expect(res.body).toMatchObject({ actionType: 'scroll_to', destination: null });
    });

    it('un CTA que no existe responde 404; el vendedor, 403; un funnel ajeno, 404', async () => {
      const { token, workspace, funnel } = await conCtas('leads');
      expect((await patch(token, `/funnels/${funnel.id}/ctas/nada`, { trackingId: 'x' })).status).toBe(404);
      const vendedor = await miembro(workspace.id, 'vendedor');
      expect((await patch(vendedor.token, `/funnels/${funnel.id}/ctas/boton`, { trackingId: 'x' })).status).toBe(403);
      expect((await get(vendedor.token, `/funnels/${funnel.id}/ctas`)).status).toBe(403);
      expect((await patch((await negocio()).token, `/funnels/${funnel.id}/ctas/boton`, { trackingId: 'x' })).status).toBe(404);
    });
  });
});
