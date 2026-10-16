import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './helpers/db.js';
import { agregarMiembro, crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

const FORM = { fields: [{ name: 'email', label: 'Correo', type: 'email', required: true }], submitLabel: 'Quiero info' };
const bloque = (key: string, type: string, content: object, order = 1) => ({ key, type, order, content, style: {} });
const THANKS = { thankYou: { message: 'Gracias por registrarte' } };
const VENTA = { paymentMethods: ['stripe'], successMessage: 'Compra lista' };

describe.skipIf(!testDatabaseUrl)('publicar y ver la página', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const get = (token: string, ruta: string) => request(app).get(`/api/v1${ruta}`).set(encabezados(token));
  const post = (token: string, ruta: string, body: object = {}) => request(app).post(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const put = (token: string, ruta: string, body: object) => request(app).put(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const patch = (token: string, ruta: string, body: object) => request(app).patch(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const pagina = (slug: string) => request(app).get(`/api/v1/public/pages/${slug}`);

  const negocio = () => crearNegocio(app, config);
  const miembro = (workspaceId: string, role: Parameters<typeof agregarMiembro>[4]) => agregarMiembro(app, prisma, config, workspaceId, role);

  async function crearFunnel(objective: string, extra: object = {}) {
    const n = await negocio();
    const res = await post(n.token, '/funnels', { workspaceId: n.workspace.id, name: 'Curso de datos', objective, ...extra });
    return { ...n, funnel: res.body as { id: string; slug: string } };
  }

  /** Un funnel de captación con todo lo necesario para publicarse. */
  async function leadsListo() {
    const f = await crearFunnel('leads');
    await put(f.token, `/funnels/${f.funnel.id}/content`, {
      blocks: [bloque('hero', 'encabezado', { title: 'Aprende datos' }, 1), bloque('form', 'formulario', FORM, 2)],
    });
    await put(f.token, `/funnels/${f.funnel.id}/type-config`, THANKS);
    return f;
  }

  /** Un funnel de venta con todo lo necesario, incluido el workspace con pagos conectados. */
  async function ventaListo() {
    const f = await crearFunnel('venta', { price: 4200 });
    await put(f.token, `/funnels/${f.funnel.id}/content`, {
      blocks: [bloque('hero', 'encabezado', { title: 'Compra ya' }, 1), bloque('pagar', 'boton', { label: 'Pagar' }, 2)],
    });
    await put(f.token, `/funnels/${f.funnel.id}/type-config`, VENTA);
    await prisma.workspace.update({ where: { id: f.workspace.id }, data: { paymentConfig: { provider: 'original_pay', apiKeyEnc: 'cifrada' } } });
    return f;
  }

  const faltantes = (res: request.Response) => (res.body.error.details.missing as { code: string }[]).map((m) => m.code).sort();

  describe('POST /funnels/:id/publish', () => {
    it('publica, guarda una versión en el historial con quién la hizo y queda auditado', async () => {
      const { token, funnel, email } = await leadsListo();
      const res = await post(token, `/funnels/${funnel.id}/publish`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('published');

      const historial = await prisma.funnelHistory.findMany({ where: { funnelId: funnel.id } });
      expect(historial).toHaveLength(1);
      const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(historial[0]).toMatchObject({ label: 'Publicado', userId: usuario.id });
      expect(Object.keys(historial[0]?.snapshot as object).sort()).toEqual(['brandBrief', 'content', 'designSpec', 'flow', 'seo']);
      expect((historial[0]?.snapshot as { content: { blocks: unknown[] } }).content.blocks).toHaveLength(2);
      expect(await prisma.auditLog.count({ where: { action: 'funnel.publish', resourceId: funnel.id } })).toBe(1);
    });

    it('un funnel vacío responde 422 con la lista completa de lo que falta y no cambia de estado', async () => {
      const { token, funnel } = await crearFunnel('leads');
      const res = await post(token, `/funnels/${funnel.id}/publish`);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('FUNNEL_NOT_READY');
      expect(faltantes(res)).toEqual(['CONTENT_EMPTY', 'FORM_MISSING', 'TYPE_CONFIG_INCOMPLETE']);
      expect((await prisma.funnel.findUniqueOrThrow({ where: { id: funnel.id } })).status).toBe('draft');
      expect(await prisma.funnelHistory.count({ where: { funnelId: funnel.id } })).toBe(0);
    });

    it('un funnel de venta sin precio ni pagos conectados dice exactamente qué falta', async () => {
      const f = await crearFunnel('venta');
      await put(f.token, `/funnels/${f.funnel.id}/content`, { blocks: [bloque('pagar', 'boton', { label: 'Pagar' })] });
      await put(f.token, `/funnels/${f.funnel.id}/type-config`, VENTA);
      const res = await post(f.token, `/funnels/${f.funnel.id}/publish`);
      expect(faltantes(res)).toEqual(['PAYMENTS_NOT_CONNECTED', 'PRICE_MISSING']);
    });

    it('un funnel de venta sin botón de pago responde que falta', async () => {
      const f = await ventaListo();
      await put(f.token, `/funnels/${f.funnel.id}/content`, { blocks: [bloque('hero', 'encabezado', { title: 'Hola' })] });
      expect(faltantes(await post(f.token, `/funnels/${f.funnel.id}/publish`))).toEqual(['CHECKOUT_BUTTON_MISSING']);
    });

    it('un funnel de venta completo y con pagos conectados se publica', async () => {
      const f = await ventaListo();
      expect((await post(f.token, `/funnels/${f.funnel.id}/publish`)).status).toBe(200);
    });

    it('un botón de tipo enlace sin destino impide publicar', async () => {
      const f = await leadsListo();
      await put(f.token, `/funnels/${f.funnel.id}/content`, {
        blocks: [bloque('form', 'formulario', FORM, 1), bloque('mas', 'boton', { label: 'Más info' }, 2)],
      });
      await patch(f.token, `/funnels/${f.funnel.id}/ctas/mas`, { actionType: 'url' });
      const res = await post(f.token, `/funnels/${f.funnel.id}/publish`);
      expect(faltantes(res)).toEqual(['CTA_DESTINATION_MISSING']);
      expect(res.body.error.details.missing[0].field).toBe('mas');
    });

    it('publicar dos veces es idempotente: no crea otra versión', async () => {
      const { token, funnel } = await leadsListo();
      await post(token, `/funnels/${funnel.id}/publish`);
      expect((await post(token, `/funnels/${funnel.id}/publish`)).status).toBe(200);
      expect(await prisma.funnelHistory.count({ where: { funnelId: funnel.id } })).toBe(1);
    });

    it('el diseñador no puede publicar (403); el marketing manager sí', async () => {
      const f = await leadsListo();
      const disenador = await miembro(f.workspace.id, 'disenador');
      const marketing = await miembro(f.workspace.id, 'marketing_manager');
      expect((await post(disenador.token, `/funnels/${f.funnel.id}/publish`)).status).toBe(403);
      expect((await prisma.funnel.findUniqueOrThrow({ where: { id: f.funnel.id } })).status).toBe('draft');
      expect((await post(marketing.token, `/funnels/${f.funnel.id}/publish`)).status).toBe(200);
    });

    it('un funnel de otro cliente responde 404 y sin sesión 401', async () => {
      const f = await leadsListo();
      expect((await post((await negocio()).token, `/funnels/${f.funnel.id}/publish`)).status).toBe(404);
      expect((await request(app).post(`/api/v1/funnels/${f.funnel.id}/publish`)).status).toBe(401);
    });
  });

  describe('POST /funnels/:id/unpublish', () => {
    it('vuelve a borrador sin borrar nada, la página deja de verse y queda auditado', async () => {
      const f = await leadsListo();
      await post(f.token, `/funnels/${f.funnel.id}/publish`);
      expect((await pagina(f.funnel.slug)).status).toBe(200);

      const res = await post(f.token, `/funnels/${f.funnel.id}/unpublish`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('draft');
      expect((await pagina(f.funnel.slug)).status).toBe(404);
      expect((await get(f.token, `/funnels/${f.funnel.id}`)).body.content.blocks).toHaveLength(2);
      expect(await prisma.auditLog.count({ where: { action: 'funnel.unpublish', resourceId: f.funnel.id } })).toBe(1);
    });

    it('despublicar un borrador es idempotente', async () => {
      const { token, funnel } = await leadsListo();
      expect((await post(token, `/funnels/${funnel.id}/unpublish`)).status).toBe(200);
    });

    it('el diseñador recibe 403 y un funnel ajeno 404', async () => {
      const f = await leadsListo();
      await post(f.token, `/funnels/${f.funnel.id}/publish`);
      const disenador = await miembro(f.workspace.id, 'disenador');
      expect((await post(disenador.token, `/funnels/${f.funnel.id}/unpublish`)).status).toBe(403);
      expect((await post((await negocio()).token, `/funnels/${f.funnel.id}/unpublish`)).status).toBe(404);
      expect((await prisma.funnel.findUniqueOrThrow({ where: { id: f.funnel.id } })).status).toBe('published');
    });
  });

  describe('GET /public/pages/:slug', () => {
    it('devuelve la página de un funnel publicado sin necesidad de sesión', async () => {
      const f = await leadsListo();
      await post(f.token, `/funnels/${f.funnel.id}/publish`);
      const res = await pagina(f.funnel.slug);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        slug: f.funnel.slug,
        objective: 'leads',
        language: 'es',
        currency: 'MXN',
        price: null,
        content: { blocks: [{ key: 'hero' }, { key: 'form' }] },
      });
      expect(res.body.ctas).toEqual([{ blockKey: 'form', label: 'Quiero info', actionType: 'form_submit', destination: null, trackingId: null }]);
    });

    it('no expone datos internos: ids, workspace, marca ni typeConfig', async () => {
      const f = await leadsListo();
      await post(f.token, `/funnels/${f.funnel.id}/publish`);
      const res = await pagina(f.funnel.slug);
      for (const campo of ['id', 'workspaceId', 'brandBrief', 'typeConfig', 'status', 'flow']) {
        expect(res.body).not.toHaveProperty(campo);
      }
      expect(JSON.stringify(res.body)).not.toContain(f.workspace.id);
      expect(JSON.stringify(res.body)).not.toContain('Gracias por registrarte');
    });

    it('un funnel de venta publicado incluye su precio como número y su divisa', async () => {
      const f = await ventaListo();
      await post(f.token, `/funnels/${f.funnel.id}/publish`);
      const res = await pagina(f.funnel.slug);
      expect(res.body).toMatchObject({ price: 4200, currency: 'MXN' });
      expect(res.body.ctas[0]).toMatchObject({ blockKey: 'pagar', actionType: 'checkout' });
    });

    it('un borrador, un slug inexistente y un slug mal formado responden 404 con el mismo error', async () => {
      const f = await leadsListo();
      const borrador = await pagina(f.funnel.slug);
      const inexistente = await pagina('no-existe-este-slug');
      const malFormado = await pagina('MAL_FORMADO');
      expect([borrador.status, inexistente.status, malFormado.status]).toEqual([404, 404, 404]);
      expect(borrador.body.error).toEqual(inexistente.body.error);
      expect(malFormado.body.error).toEqual(inexistente.body.error);
    });

    it('los cambios al contenido se ven de inmediato en la página publicada', async () => {
      const f = await leadsListo();
      await post(f.token, `/funnels/${f.funnel.id}/publish`);
      await patch(f.token, `/funnels/${f.funnel.id}/content/blocks/hero`, { content: { title: 'Título nuevo' } });
      expect((await pagina(f.funnel.slug)).body.content.blocks[0].content.title).toBe('Título nuevo');
    });

    it('el cambio de slug de un funnel publicado cambia su dirección', async () => {
      const f = await leadsListo();
      await post(f.token, `/funnels/${f.funnel.id}/publish`);
      const nuevo = `nuevo-${randomUUID().slice(0, 6)}`;
      await patch(f.token, `/funnels/${f.funnel.id}`, { slug: nuevo });
      expect((await pagina(f.funnel.slug)).status).toBe(404);
      expect((await pagina(nuevo)).status).toBe(200);
    });
  });

  describe('protecciones de las rutas públicas', () => {
    it('solo los orígenes de PUBLIC_CORS_ORIGINS pueden leer la página desde un navegador', async () => {
      const ctx = buildTestApp({ PUBLIC_CORS_ORIGINS: 'https://paginas.ejemplo.com' });
      try {
        const permitido = await request(ctx.app).get('/api/v1/public/pages/x').set('Origin', 'https://paginas.ejemplo.com');
        const otro = await request(ctx.app).get('/api/v1/public/pages/x').set('Origin', 'https://sitio-malicioso.com');
        expect(permitido.headers['access-control-allow-origin']).toBe('https://paginas.ejemplo.com');
        expect(otro.headers['access-control-allow-origin']).toBeUndefined();
      } finally {
        await ctx.prisma.$disconnect();
      }
    });

    it('el origen de la plataforma no obtiene permiso en las rutas públicas', async () => {
      const res = await request(app).get('/api/v1/public/pages/x').set('Origin', 'http://localhost:5173');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('responde el preflight de un origen permitido y no ofrece permisos a otro', async () => {
      const ctx = buildTestApp({ PUBLIC_CORS_ORIGINS: 'https://paginas.ejemplo.com' });
      try {
        const ok = await request(ctx.app).options('/api/v1/public/pages/x').set('Origin', 'https://paginas.ejemplo.com').set('Access-Control-Request-Method', 'GET');
        const mal = await request(ctx.app).options('/api/v1/public/pages/x').set('Origin', 'https://otro.com').set('Access-Control-Request-Method', 'GET');
        expect(ok.headers['access-control-allow-origin']).toBe('https://paginas.ejemplo.com');
        expect(mal.headers['access-control-allow-origin']).toBeUndefined();
      } finally {
        await ctx.prisma.$disconnect();
      }
    });

    it('responde 429 al pasar el límite de peticiones públicas por minuto', async () => {
      const ctx = buildTestApp({ RATE_LIMIT_PUBLIC_PER_MINUTE: '2' });
      try {
        expect((await request(ctx.app).get('/api/v1/public/pages/x')).status).toBe(404);
        expect((await request(ctx.app).get('/api/v1/public/pages/x')).status).toBe(404);
        const bloqueada = await request(ctx.app).get('/api/v1/public/pages/x');
        expect(bloqueada.status).toBe(429);
        expect(bloqueada.body.error.code).toBe('RATE_LIMITED');
      } finally {
        await ctx.prisma.$disconnect();
      }
    });
  });
});
