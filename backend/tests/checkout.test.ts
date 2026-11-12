import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { emailUnico } from './helpers/auth.js';
import { testDatabaseUrl } from './helpers/db.js';
import { createFakeOriginalPay, FAKE_SECRET_KEY, FAKE_TOKEN_APP } from './helpers/fakeOriginalPay.js';
import { crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

const TYPE_CONFIG = { paymentMethods: ['stripe', 'mercadopago'], successMessage: '¡Gracias por tu compra!', successUrl: 'https://ejemplo.com/gracias' };

describe.skipIf(!testDatabaseUrl)('compra en la página pública con Original Pay', () => {
  const fake = createFakeOriginalPay();
  const { app, prisma, config } = buildTestApp({ ORIGINALPAY_TOKEN_APP: FAKE_TOKEN_APP, ORIGINALPAY_SECRET_KEY: FAKE_SECRET_KEY }, { fetchFn: fake.fetchFn });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(() => fake.reset());

  const comprar = (slug: string, body: object, key?: string) => {
    const req = request(app).post(`/api/v1/public/funnels/${slug}/checkout`);
    return (key ? req.set('Idempotency-Key', key) : req).send(body);
  };
  const orden = (publicToken: string) => request(app).get(`/api/v1/public/orders/${publicToken}`);
  /** El aviso de pago que Original Pay envía al servidor (sin sesión: de servidor a servidor). */
  const aviso = (body: object) => request(app).post('/api/v1/webhooks/original-pay').send(body);
  const numeroDeOrden = () => fake.orderNumbers()[0] as string;
  const bodyCompra = (extra: object = {}) => ({ name: 'María', email: emailUnico(), consent: true, ...extra });

  /** Un funnel de venta publicado de 1,200 MXN; con o sin pagos habilitados en el negocio. */
  async function venta({ habilitar = true, price = 1200 }: { habilitar?: boolean; price?: number } = {}) {
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
    const c = await request(app).put(`/api/v1/workspaces/${n.workspace.id}/payments`).set(encabezados(n.token)).send({ currency: 'MXN', methods: ['stripe', 'mercadopago'] });
    expect(c.status).toBe(200);
    const publicado = await request(app).post(`/api/v1/funnels/${funnel.id}/publish`).set(encabezados(n.token));
    expect(publicado.status).toBe(200);
    // Publicar exige pagos habilitados; para probar el caso contrario se deshabilitan después, en la base.
    if (!habilitar) await prisma.workspace.update({ where: { id: n.workspace.id }, data: { paymentConfig: Prisma.DbNull } });
    return { ...n, funnel };
  }

  describe('POST /public/funnels/:slug/checkout', () => {
    it('crea el lead y la orden con el monto del funnel, crea la orden en Original Pay con el token_app del servidor y responde la dirección de pago', async () => {
      const f = await venta();
      const body = bodyCompra({ paymentMethod: 'mercadopago' });
      const res = await comprar(f.funnel.slug, body);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'pending', paymentUrl: expect.stringMatching(/^https:\/\/pago\.ejemplo\.com\//) });
      expect(res.body.publicToken).toEqual(expect.any(String));

      const guardada = await prisma.order.findFirstOrThrow({ where: { funnelId: f.funnel.id } });
      expect(guardada).toMatchObject({ status: 'pending', currency: 'MXN', paymentMethod: 'mercadopago', customerEmail: body.email, paymentUrl: res.body.paymentUrl });
      expect(Number(guardada.amount)).toBe(1200);

      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0]?.path).toBe('/payment/init');
      expect(fake.calls[0]?.body).toMatchObject({
        token_app: FAKE_TOKEN_APP,
        amount: 1200,
        currency: 'MXN',
        product_code: f.funnel.slug,
        customer_email: body.email,
        order_number: guardada.orderNumber,
      });

      const lead = await prisma.lead.findFirstOrThrow({ where: { funnelId: f.funnel.id } });
      expect(lead.email).toBe(body.email);
      const eventos = (await prisma.event.findMany({ where: { funnelId: f.funnel.id } })).map((e) => e.type).sort();
      expect(eventos).toEqual(['checkout_started', 'lead_created']);
    });

    it('sin elegir método también funciona (el comprador lo elige en la pantalla de Original Pay); uno que el negocio no acepta da 422 con la ruta paymentMethod', async () => {
      const f = await venta();
      expect((await comprar(f.funnel.slug, bodyCompra())).status).toBe(201);
      const mal = await comprar(f.funnel.slug, bodyCompra({ paymentMethod: 'webpay' }));
      expect(mal.status).toBe(422);
      expect(mal.body.error.details[0].path).toBe('paymentMethod');
    });

    it('el monto nunca viaja: un amount enviado por el navegador se ignora', async () => {
      const f = await venta();
      await comprar(f.funnel.slug, bodyCompra({ amount: 1, price: 1 }));
      expect(fake.calls[0]?.body?.amount).toBe(1200);
    });

    it('pulsar pagar otra vez reutiliza la orden y su dirección de pago: no se crea otra orden ni otra llamada a Original Pay', async () => {
      const f = await venta();
      const body = bodyCompra();
      const a = await comprar(f.funnel.slug, body);
      const b = await comprar(f.funnel.slug, body);
      expect(b.body).toEqual(a.body);
      expect(await prisma.order.count({ where: { funnelId: f.funnel.id } })).toBe(1);
      expect(await prisma.lead.count({ where: { funnelId: f.funnel.id } })).toBe(1);
      expect(fake.calls).toHaveLength(1);
    });

    it('con la misma Idempotency-Key no vuelve a llamar a Original Pay', async () => {
      const f = await venta();
      const body = bodyCompra();
      const clave = randomUUID();
      const a = await comprar(f.funnel.slug, body, clave);
      const b = await comprar(f.funnel.slug, body, clave);
      expect(b.status).toBe(201);
      expect(b.body.publicToken).toBe(a.body.publicToken);
      expect(fake.calls).toHaveLength(1);
    });

    it('una compra ya pagada responde 409 ORDER_ALREADY_PAID', async () => {
      const f = await venta();
      const body = bodyCompra();
      await comprar(f.funnel.slug, body);
      expect((await aviso(fake.webhook(numeroDeOrden(), 'approved'))).status).toBe(200);
      const otra = await comprar(f.funnel.slug, body);
      expect(otra.status).toBe(409);
      expect(otra.body.error.code).toBe('ORDER_ALREADY_PAID');
    });

    it('sin pagos habilitados en el negocio responde 422 PAYMENTS_NOT_CONNECTED y no llama a Original Pay', async () => {
      const f = await venta({ habilitar: false });
      const res = await comprar(f.funnel.slug, bodyCompra());
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PAYMENTS_NOT_CONNECTED');
      expect(fake.calls).toHaveLength(0);
    });

    it('si el servidor no tiene las credenciales de Original Pay responde 503 PAYMENTS_NOT_CONFIGURED y no llama al servicio', async () => {
      const sin = buildTestApp({}, { fetchFn: fake.fetchFn });
      try {
        const n = await crearNegocio(sin.app, sin.config);
        const creado = await request(sin.app).post('/api/v1/funnels').set(encabezados(n.token)).send({ workspaceId: n.workspace.id, name: 'Curso', objective: 'venta', price: 100 });
        const id = creado.body.id as string;
        await request(sin.app).put(`/api/v1/funnels/${id}/content`).set(encabezados(n.token)).send({ blocks: [{ key: 'pagar', type: 'boton', order: 1, content: { label: 'Comprar' }, style: {} }] });
        await request(sin.app).put(`/api/v1/funnels/${id}/type-config`).set(encabezados(n.token)).send(TYPE_CONFIG);
        await request(sin.app).put(`/api/v1/workspaces/${n.workspace.id}/payments`).set(encabezados(n.token)).send({ currency: 'MXN', methods: ['stripe'] });
        await request(sin.app).post(`/api/v1/funnels/${id}/publish`).set(encabezados(n.token));
        const res = await request(sin.app).post(`/api/v1/public/funnels/${creado.body.slug}/checkout`).send(bodyCompra());
        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe('PAYMENTS_NOT_CONFIGURED');
        expect(fake.calls).toHaveLength(0);
      } finally {
        await sin.prisma.$disconnect();
      }
    });

    it('exige nombre, correo válido y consentimiento', async () => {
      const f = await venta();
      for (const mala of [{ name: '' }, { email: 'no-es-correo' }, { consent: false }, { consent: undefined }]) {
        expect((await comprar(f.funnel.slug, bodyCompra(mala))).status).toBe(422);
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
      const formulario = { fields: [{ name: 'email', label: 'Correo', type: 'email', required: true }], submitLabel: 'Enviar' };
      await request(app).put(`/api/v1/funnels/${funnel.id}/content`).set(encabezados(n.token)).send({ blocks: [{ key: 'f', type: 'formulario', order: 1, content: formulario, style: {} }] });
      await request(app).put(`/api/v1/funnels/${funnel.id}/type-config`).set(encabezados(n.token)).send({ thankYou: { message: 'Gracias' } });
      await request(app).post(`/api/v1/funnels/${funnel.id}/publish`).set(encabezados(n.token));
      const res = await comprar(funnel.slug, bodyCompra());
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('FUNNEL_NOT_SELLABLE');
    });

    it('si Original Pay falla, la orden queda pendiente sin dirección y al reintentar se reutiliza con el mismo order_number', async () => {
      const f = await venta();
      const body = bodyCompra();
      fake.failNext({ status: 503 });
      const mala = await comprar(f.funnel.slug, body);
      expect(mala.status).toBe(503);
      const pendiente = await prisma.order.findFirstOrThrow({ where: { funnelId: f.funnel.id } });
      expect(pendiente).toMatchObject({ status: 'pending', paymentUrl: null });

      const ok = await comprar(f.funnel.slug, body);
      expect(ok.status).toBe(201);
      expect(await prisma.order.count({ where: { funnelId: f.funnel.id } })).toBe(1);
      expect(fake.calls.map((c) => c.body?.order_number)).toEqual([pendiente.orderNumber, pendiente.orderNumber]);
    });

    it('un token_app rechazado por Original Pay responde 503 PAYMENTS_MISCONFIGURED sin revelar nada', async () => {
      const mal = buildTestApp({ ORIGINALPAY_TOKEN_APP: 'app_token_equivocado', ORIGINALPAY_SECRET_KEY: FAKE_SECRET_KEY }, { fetchFn: fake.fetchFn });
      try {
        const n = await crearNegocio(mal.app, mal.config);
        const creado = await request(mal.app).post('/api/v1/funnels').set(encabezados(n.token)).send({ workspaceId: n.workspace.id, name: 'Curso', objective: 'venta', price: 100 });
        const id = creado.body.id as string;
        await request(mal.app).put(`/api/v1/funnels/${id}/content`).set(encabezados(n.token)).send({ blocks: [{ key: 'pagar', type: 'boton', order: 1, content: { label: 'Comprar' }, style: {} }] });
        await request(mal.app).put(`/api/v1/funnels/${id}/type-config`).set(encabezados(n.token)).send(TYPE_CONFIG);
        await request(mal.app).put(`/api/v1/workspaces/${n.workspace.id}/payments`).set(encabezados(n.token)).send({ currency: 'MXN', methods: ['stripe'] });
        await request(mal.app).post(`/api/v1/funnels/${id}/publish`).set(encabezados(n.token));
        const res = await request(mal.app).post(`/api/v1/public/funnels/${creado.body.slug}/checkout`).send(bodyCompra());
        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe('PAYMENTS_MISCONFIGURED');
        expect(JSON.stringify(res.body)).not.toContain('app_token_equivocado');
      } finally {
        await mal.prisma.$disconnect();
      }
    });

    it('la respuesta y los datos guardados no contienen el token_app ni el secret_key', async () => {
      const f = await venta();
      const res = await comprar(f.funnel.slug, bodyCompra());
      const guardado = JSON.stringify(await prisma.order.findMany({ where: { funnelId: f.funnel.id } }));
      for (const secreto of [FAKE_TOKEN_APP, FAKE_SECRET_KEY]) {
        expect(JSON.stringify(res.body)).not.toContain(secreto);
        expect(guardado).not.toContain(secreto);
      }
    });
  });

  describe('GET /public/orders/:publicToken', () => {
    it('pendiente: sigue pendiente, con su página, y no muestra el mensaje de éxito', async () => {
      const f = await venta();
      const c = await comprar(f.funnel.slug, bodyCompra());
      const res = await orden(c.body.publicToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ publicToken: c.body.publicToken, slug: f.funnel.slug, status: 'pending' });
    });

    it('tras el aviso de pago aprobado: pagada, con el mensaje y la dirección de éxito del funnel', async () => {
      const f = await venta();
      const c = await comprar(f.funnel.slug, bodyCompra());
      await aviso(fake.webhook(numeroDeOrden(), 'approved'));
      const res = await orden(c.body.publicToken);
      expect(res.body).toEqual({ publicToken: c.body.publicToken, slug: f.funnel.slug, status: 'paid', message: TYPE_CONFIG.successMessage, redirectUrl: TYPE_CONFIG.successUrl });
    });

    it('un token inexistente o con formato inválido: 404 ORDER_NOT_FOUND / 422', async () => {
      const res = await orden(randomUUID());
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
      expect((await orden('no-es-un-uuid')).status).toBe(422);
    });
  });

  describe('POST /webhooks/original-pay (aviso de pago)', () => {
    it('aprobado: marca la orden pagada con su método, mueve el lead a «ganado» con su valor y registra payment_completed una sola vez aunque el aviso llegue varias veces', async () => {
      const f = await venta();
      await comprar(f.funnel.slug, bodyCompra());
      const body = fake.webhook(numeroDeOrden(), 'approved');
      for (let i = 0; i < 3; i += 1) {
        const res = await aviso(body);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ received: true });
      }
      const guardada = await prisma.order.findFirstOrThrow({ where: { funnelId: f.funnel.id } });
      expect(guardada).toMatchObject({ status: 'paid', paymentMethod: 'stripe' });
      expect(guardada.paidAt).not.toBeNull();
      const lead = await prisma.lead.findFirstOrThrow({ where: { funnelId: f.funnel.id }, include: { leadStage: true } });
      expect(lead.leadStage.isWon).toBe(true);
      expect(Number(lead.value)).toBe(1200);
      expect(await prisma.event.count({ where: { funnelId: f.funnel.id, type: 'payment_completed' } })).toBe(1);
    });

    it('pendiente: no cambia nada', async () => {
      const f = await venta();
      await comprar(f.funnel.slug, bodyCompra());
      expect((await aviso(fake.webhook(numeroDeOrden(), 'pending'))).status).toBe(200);
      expect((await prisma.order.findFirstOrThrow({ where: { funnelId: f.funnel.id } })).status).toBe('pending');
    });

    it('rechazado o cancelado: la orden sigue pendiente (se puede reintentar), queda constancia y un pago posterior sí la completa', async () => {
      const f = await venta();
      await comprar(f.funnel.slug, bodyCompra());
      await aviso(fake.webhook(numeroDeOrden(), 'rejected'));
      await aviso(fake.webhook(numeroDeOrden(), 'cancelled'));
      expect((await prisma.order.findFirstOrThrow({ where: { funnelId: f.funnel.id } })).status).toBe('pending');
      expect(await prisma.event.count({ where: { funnelId: f.funnel.id, type: 'payment_failed' } })).toBe(2);
      expect(await prisma.event.count({ where: { funnelId: f.funnel.id, type: 'payment_completed' } })).toBe(0);

      await aviso(fake.webhook(numeroDeOrden(), 'approved'));
      expect((await prisma.order.findFirstOrThrow({ where: { funnelId: f.funnel.id } })).status).toBe('paid');
    });

    it('credenciales inválidas (token_app o secret_key): 401 y no cambia nada', async () => {
      const f = await venta();
      await comprar(f.funnel.slug, bodyCompra());
      for (const malas of [{ token_app: 'app_otro' }, { secret_key: 'sk_otro' }, { token_app: 'x', secret_key: 'y' }]) {
        const res = await aviso(fake.webhook(numeroDeOrden(), 'approved', malas));
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      }
      expect((await prisma.order.findFirstOrThrow({ where: { funnelId: f.funnel.id } })).status).toBe('pending');
    });

    it('un aviso aprobado con otro monto o divisa que la orden responde 409 y NO marca la orden como pagada', async () => {
      const f = await venta();
      await comprar(f.funnel.slug, bodyCompra());
      const monto = await aviso(fake.webhook(numeroDeOrden(), 'approved', { amount: 1 }));
      expect(monto.status).toBe(409);
      expect(monto.body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');
      expect((await aviso(fake.webhook(numeroDeOrden(), 'approved', { currency: 'USD' }))).status).toBe(409);
      expect((await prisma.order.findFirstOrThrow({ where: { funnelId: f.funnel.id } })).status).toBe('pending');
    });

    it('acepta el monto como texto y la divisa en minúsculas', async () => {
      const f = await venta();
      await comprar(f.funnel.slug, bodyCompra());
      const res = await aviso(fake.webhook(numeroDeOrden(), 'approved', { amount: '1200.00', currency: 'mxn' }));
      expect(res.status).toBe(200);
      expect((await prisma.order.findFirstOrThrow({ where: { funnelId: f.funnel.id } })).status).toBe('paid');
    });

    it('una orden desconocida responde 404 ORDER_NOT_FOUND', async () => {
      const res = await aviso(fake.webhook('OF-NO-EXISTE', 'approved', { amount: 10, currency: 'MXN' }));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('un cuerpo inválido (estado desconocido o campos faltantes) responde 422', async () => {
      expect((await aviso({ ...fake.webhook('OF-1', 'approved'), payment_status: 'quizas' })).status).toBe(422);
      expect((await aviso({ token_app: FAKE_TOKEN_APP })).status).toBe(422);
    });

    it('sin las credenciales de Original Pay en el servidor responde 503 y no procesa nada', async () => {
      const sin = buildTestApp();
      try {
        const res = await request(sin.app).post('/api/v1/webhooks/original-pay').send(fake.webhook('OF-1', 'approved', { amount: 10, currency: 'MXN' }));
        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe('PAYMENTS_NOT_CONFIGURED');
      } finally {
        await sin.prisma.$disconnect();
      }
    });

    it('no pide sesión ni CORS: es de servidor a servidor', async () => {
      const f = await venta();
      await comprar(f.funnel.slug, bodyCompra());
      const res = await aviso(fake.webhook(numeroDeOrden(), 'pending'));
      expect(res.status).toBe(200);
    });
  });
});
