import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { Prisma } from '../src/generated/prisma/client.js';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { emailUnico } from './helpers/auth.js';
import { testDatabaseUrl } from './helpers/db.js';
import { createFakeOriginalPay } from './helpers/fakeOriginalPay.js';
import { crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

const API_KEY = 'app_ak_llave_secreta_de_prueba_123';
const TYPE_CONFIG = { paymentMethods: ['stripe', 'mercadopago'], successMessage: '¡Gracias por tu compra!', successUrl: 'https://ejemplo.com/gracias' };

describe.skipIf(!testDatabaseUrl)('compra en la página pública con Original Pay', () => {
  const fake = createFakeOriginalPay();
  const { app, prisma, config } = buildTestApp({ PAYMENT_CONFIG_ENCRYPTION_KEY: randomBytes(32).toString('hex') }, { fetchFn: fake.fetchFn });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(() => fake.reset());

  const comprar = (slug: string, body: object, key?: string) => {
    const req = request(app).post(`/api/v1/public/funnels/${slug}/checkout`);
    return (key ? req.set('Idempotency-Key', key) : req).send(body);
  };
  const orden = (publicToken: string) => request(app).get(`/api/v1/public/orders/${publicToken}`);
  /** El token de la única orden que existe ahora en el Original Pay de mentira. */
  const token = () => fake.orderTokens()[0] as string;
  const bodyCompra = (extra: object = {}) => ({ name: 'María', email: emailUnico(), consent: true, ...extra });

  /** Un funnel de venta publicado de 1,200 MXN; con o sin Original Pay conectado. */
  async function venta({ conectar = true, price = 1200 }: { conectar?: boolean; price?: number } = {}) {
    const n = await crearNegocio(app, config);
    const creado = await request(app)
      .post('/api/v1/funnels')
      .set(encabezados(n.token))
      .send({ workspaceId: n.workspace.id, name: 'Curso de datos', objective: 'venta', price, currency: 'MXN' });
    const funnel = creado.body as { id: string; slug: string };
    await request(app)
      .put(`/api/v1/funnels/${funnel.id}/content`)
      .set(encabezados(n.token))
      .send({ blocks: [{ key: 'pagar', type: 'boton', order: 1, content: { label: 'Comprar' }, style: {} }] });
    await request(app).put(`/api/v1/funnels/${funnel.id}/type-config`).set(encabezados(n.token)).send(TYPE_CONFIG);
    {
      const c = await request(app).put(`/api/v1/workspaces/${n.workspace.id}/payments`).set(encabezados(n.token)).send({ apiKey: API_KEY, currency: 'MXN', methods: ['stripe', 'mercadopago'] });
      expect(c.status).toBe(200);
    }
    const publicado = await request(app).post(`/api/v1/funnels/${funnel.id}/publish`).set(encabezados(n.token));
    expect(publicado.status).toBe(200);
    // Publicar exige Original Pay conectado; para probar el caso contrario se desconecta después, en la base.
    if (!conectar) await prisma.workspace.update({ where: { id: n.workspace.id }, data: { paymentConfig: Prisma.DbNull } });
    return { ...n, funnel };
  }

  describe('POST /public/funnels/:slug/checkout', () => {
    it('crea el lead y la orden con el monto del funnel, llama a Original Pay con la llave del negocio y responde la dirección de pago', async () => {
      const f = await venta();
      const body = bodyCompra({ paymentMethod: 'mercadopago' });
      const res = await comprar(f.funnel.slug, body);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'pending', paymentUrl: expect.stringMatching(/^https:\/\/pago\.ejemplo\.com\//) });
      expect(res.body.publicToken).toEqual(expect.any(String));

      const guardada = await prisma.order.findFirstOrThrow({ where: { funnelId: f.funnel.id } });
      expect(guardada).toMatchObject({ status: 'pending', currency: 'MXN', paymentMethod: 'mercadopago', customerEmail: body.email });
      expect(Number(guardada.amount)).toBe(1200);
      expect(guardada.opOrderToken).toBe(token());

      const init = fake.callsTo('/payment/init')[0];
      expect(init?.apiKey).toBe(API_KEY);
      expect(init?.body).toMatchObject({ amount: 1200, currency: 'MXN', product_code: f.funnel.slug, customer_email: body.email, order_number: guardada.orderNumber });
      expect(fake.callsTo('/payment/process')[0]?.body).toMatchObject({ order_token: token(), payment_method: 'mercadopago' });

      const lead = await prisma.lead.findFirstOrThrow({ where: { funnelId: f.funnel.id } });
      expect(lead.email).toBe(body.email);
      const eventos = (await prisma.event.findMany({ where: { funnelId: f.funnel.id } })).map((e) => e.type).sort();
      expect(eventos).toEqual(['checkout_started', 'lead_created']);
    });

    it('con Stripe devuelve el clientSecret solo en esa respuesta y no lo guarda', async () => {
      const f = await venta();
      const res = await comprar(f.funnel.slug, bodyCompra({ paymentMethod: 'stripe' }));
      expect(res.status).toBe(201);
      expect(res.body.clientSecret).toMatch(/^pi_/);
      const guardada = await prisma.order.findFirstOrThrow({ where: { funnelId: f.funnel.id } });
      expect(JSON.stringify(guardada)).not.toContain('secret');
    });

    it('si no se elige método usa el primero de la conexión; uno que el negocio no acepta da 422 con la ruta paymentMethod', async () => {
      const f = await venta();
      const ok = await comprar(f.funnel.slug, bodyCompra());
      expect(ok.status).toBe(201);
      expect(fake.callsTo('/payment/process')[0]?.body).toMatchObject({ payment_method: 'stripe' });

      const mal = await comprar(f.funnel.slug, bodyCompra({ paymentMethod: 'webpay' }));
      expect(mal.status).toBe(422);
      expect(mal.body.error.details[0].path).toBe('paymentMethod');
    });

    it('el monto nunca viaja: un amount enviado por el navegador se ignora', async () => {
      const f = await venta();
      await comprar(f.funnel.slug, bodyCompra({ amount: 1, price: 1 }));
      expect(fake.callsTo('/payment/init')[0]?.body?.amount).toBe(1200);
    });

    it('pulsar pagar otra vez reutiliza la orden pendiente y no crea otra', async () => {
      const f = await venta();
      const body = bodyCompra();
      const a = await comprar(f.funnel.slug, body);
      const b = await comprar(f.funnel.slug, body);
      expect(b.body.publicToken).toBe(a.body.publicToken);
      expect(await prisma.order.count({ where: { funnelId: f.funnel.id } })).toBe(1);
      expect(await prisma.lead.count({ where: { funnelId: f.funnel.id } })).toBe(1);
    });

    it('con la misma Idempotency-Key no vuelve a llamar a Original Pay', async () => {
      const f = await venta();
      const body = bodyCompra();
      const clave = randomUUID();
      const a = await comprar(f.funnel.slug, body, clave);
      const llamadas = fake.calls.length;
      const b = await comprar(f.funnel.slug, body, clave);
      expect(b.status).toBe(201);
      expect(b.body.publicToken).toBe(a.body.publicToken);
      expect(fake.calls.length).toBe(llamadas);
    });

    it('una orden ya pagada responde 409 ORDER_ALREADY_PAID', async () => {
      const f = await venta();
      const body = bodyCompra();
      const a = await comprar(f.funnel.slug, body);
      fake.setStatus(token(), 'pagado');
      await orden(a.body.publicToken);
      const otra = await comprar(f.funnel.slug, body);
      expect(otra.status).toBe(409);
      expect(otra.body.error.code).toBe('ORDER_ALREADY_PAID');
    });

    it('sin Original Pay conectado responde 422 PAYMENTS_NOT_CONNECTED y no llama al servicio', async () => {
      const f = await venta({ conectar: false });
      const res = await comprar(f.funnel.slug, bodyCompra());
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PAYMENTS_NOT_CONNECTED');
      expect(fake.calls).toHaveLength(0);
    });

    it('exige nombre, correo válido y consentimiento', async () => {
      const f = await venta();
      for (const mala of [{ name: '' }, { email: 'no-es-correo' }, { consent: false }, { consent: undefined }]) {
        const res = await comprar(f.funnel.slug, bodyCompra(mala));
        expect(res.status).toBe(422);
      }
      expect(fake.calls).toHaveLength(0);
    });

    it('un slug inexistente o un funnel no publicado dan 404', async () => {
      const f = await venta();
      expect((await comprar('no-existe-este-slug', bodyCompra())).status).toBe(404);
      await request(app).post(`/api/v1/funnels/${f.funnel.id}/unpublish`).set(encabezados(f.token));
      expect((await comprar(f.funnel.slug, bodyCompra())).status).toBe(404);
    });

    it('un funnel que no es de venta responde 422 FUNNEL_NOT_SELLABLE', async () => {
      const n = await crearNegocio(app, config);
      const creado = await request(app).post('/api/v1/funnels').set(encabezados(n.token)).send({ workspaceId: n.workspace.id, name: 'Captación', objective: 'leads' });
      const funnel = creado.body as { id: string; slug: string };
      await request(app).put(`/api/v1/funnels/${funnel.id}/content`).set(encabezados(n.token)).send({ blocks: [{ key: 'f', type: 'formulario', order: 1, content: { fields: [{ name: 'email', label: 'Correo', type: 'email', required: true }], submitLabel: 'Enviar' }, style: {} }] });
      await request(app).put(`/api/v1/funnels/${funnel.id}/type-config`).set(encabezados(n.token)).send({ thankYou: { message: 'Gracias' } });
      await request(app).post(`/api/v1/funnels/${funnel.id}/publish`).set(encabezados(n.token));
      const res = await comprar(funnel.slug, bodyCompra());
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('FUNNEL_NOT_SELLABLE');
    });

    it('si Original Pay falla, la orden queda pendiente y se puede reintentar sin duplicarla', async () => {
      const f = await venta();
      const body = bodyCompra();
      fake.failNext('process', { status: 500 });
      const mala = await comprar(f.funnel.slug, body);
      expect(mala.status).toBeGreaterThanOrEqual(500);
      const ok = await comprar(f.funnel.slug, body);
      expect(ok.status).toBe(201);
      expect(await prisma.order.count({ where: { funnelId: f.funnel.id } })).toBe(1);
    });

    it('la respuesta y los datos guardados no contienen la apikey', async () => {
      const f = await venta();
      const res = await comprar(f.funnel.slug, bodyCompra());
      expect(JSON.stringify(res.body)).not.toContain(API_KEY);
      expect(JSON.stringify(await prisma.order.findMany({ where: { funnelId: f.funnel.id } }))).not.toContain(API_KEY);
    });
  });

  describe('GET /public/orders/:publicToken', () => {
    it('pendiente: sigue pendiente y no muestra el mensaje de éxito', async () => {
      const f = await venta();
      const c = await comprar(f.funnel.slug, bodyCompra());
      const res = await orden(c.body.publicToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ publicToken: c.body.publicToken, slug: f.funnel.slug, status: 'pending' });
    });

    it('al pagarse: marca pagada, mueve el lead a «ganado», registra payment_completed una sola vez y muestra el mensaje y la dirección de éxito', async () => {
      const f = await venta();
      const c = await comprar(f.funnel.slug, bodyCompra());
      fake.setStatus(token(), 'pagado');
      const res = await orden(c.body.publicToken);
      expect(res.body).toEqual({ publicToken: c.body.publicToken, slug: f.funnel.slug, status: 'paid', message: TYPE_CONFIG.successMessage, redirectUrl: TYPE_CONFIG.successUrl });
      await orden(c.body.publicToken);
      await orden(c.body.publicToken);

      const guardada = await prisma.order.findFirstOrThrow({ where: { funnelId: f.funnel.id } });
      expect(guardada.status).toBe('paid');
      expect(guardada.paidAt).not.toBeNull();
      const lead = await prisma.lead.findFirstOrThrow({ where: { funnelId: f.funnel.id }, include: { leadStage: true } });
      expect(lead.leadStage.isWon).toBe(true);
      expect(Number(lead.value)).toBe(1200);
      expect(await prisma.event.count({ where: { funnelId: f.funnel.id, type: 'payment_completed' } })).toBe(1);
    });

    it('cancelada en Original Pay: queda cancelada', async () => {
      const f = await venta();
      const c = await comprar(f.funnel.slug, bodyCompra());
      fake.setStatus(token(), 'cancelado');
      expect((await orden(c.body.publicToken)).body.status).toBe('cancelled');
    });

    it('un token inexistente o con formato inválido: 404 ORDER_NOT_FOUND / 422', async () => {
      const res = await orden(randomUUID());
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
      expect((await orden('no-es-un-uuid')).status).toBe(422);
    });
  });
});
