import { describe, expect, it, vi } from 'vitest';
import { createOriginalPayClient } from '../src/integrations/original-pay/client.js';
import { AppError } from '../src/lib/errors.js';
import { createLogger } from '../src/lib/logger.js';
import type { OperationLogModel } from '../src/models/operationLog.model.js';
import { createOperationLogService } from '../src/services/operationLog.service.js';
import { createFakeOriginalPay } from './helpers/fakeOriginalPay.js';

const CTX = { requestId: 'req_aaaaaaaaaaaa', workspaceId: 'ws-1' };
const API_KEY = 'app_ak_llave_de_prueba';
const INIT = { amount: 4200, currency: 'MXN' as const, orderNumber: 'OF-1', productCode: 'curso-de-datos', description: 'Curso', customerEmail: 'a@b.com' };

function setup() {
  const fake = createFakeOriginalPay();
  const filas: Record<string, unknown>[] = [];
  const model: OperationLogModel = { create: vi.fn(async (d) => void filas.push(d as Record<string, unknown>)) };
  const esperas: number[] = [];
  const logger = createLogger('silent');
  const client = createOriginalPayClient({
    baseUrl: 'https://api-test.origpay.com/',
    logger,
    operationLog: createOperationLogService(model, logger),
    fetchFn: fake.fetchFn,
    sleep: async (ms) => void esperas.push(ms),
    random: () => 0,
  });
  return { fake, client, filas, esperas };
}

const codigoDe = async (promesa: Promise<unknown>) => ((await promesa.catch((e) => e)) as AppError).code;

describe('cliente de Original Pay', () => {
  it('init envía la apikey, los datos de la orden con los nombres de Original Pay y devuelve el order_token', async () => {
    const { fake, client } = setup();
    const res = await client.initPayment(CTX, API_KEY, INIT);
    expect(res.orderToken).toMatch(/^ord_tok_/);
    expect(fake.calls[0]).toEqual({
      method: 'POST',
      path: '/payment/init',
      apiKey: API_KEY,
      body: { amount: 4200, currency: 'MXN', order_number: 'OF-1', product_code: 'curso-de-datos', description: 'Curso', customer_email: 'a@b.com' },
    });
  });

  it('process devuelve la URL de pago (MercadoPago, PayPal...) o el client_secret (Stripe)', async () => {
    const { client } = setup();
    const { orderToken } = await client.initPayment(CTX, API_KEY, INIT);
    const mp = await client.processPayment(CTX, API_KEY, { orderToken, paymentMethod: 'mercadopago' });
    expect(mp).toEqual({ paymentUrl: `https://pago.ejemplo.com/pay/${orderToken}`, clientSecret: undefined });
    const stripe = await client.processPayment(CTX, API_KEY, { orderToken, paymentMethod: 'stripe' });
    expect(stripe.clientSecret).toContain('secret');
    expect(stripe.paymentUrl).toBeUndefined();
  });

  it('getStatus traduce los estados de Original Pay a los propios', async () => {
    const { fake, client } = setup();
    const { orderToken } = await client.initPayment(CTX, API_KEY, INIT);
    expect((await client.getStatus(CTX, API_KEY, orderToken)).status).toBe('pending');
    for (const [remoto, propio] of [['pagado', 'paid'], ['cancelado', 'cancelled'], ['parcialmente_pagado', 'pending'], ['pendiente', 'pending']] as const) {
      fake.setStatus(orderToken, remoto);
      expect((await client.getStatus(CTX, API_KEY, orderToken)).status).toBe(propio);
    }
  });

  it('init reutiliza la orden pendiente del mismo comprador y producto (deduplicación de Original Pay)', async () => {
    const { client } = setup();
    const a = await client.initPayment(CTX, API_KEY, INIT);
    const b = await client.initPayment(CTX, API_KEY, INIT);
    expect(b.orderToken).toBe(a.orderToken);
  });

  describe('errores y reintentos', () => {
    it('un 5xx en init se reintenta con espera exponencial y después sale bien', async () => {
      const { fake, client, esperas } = setup();
      fake.failNext('init', { status: 503 });
      const res = await client.initPayment(CTX, API_KEY, INIT);
      expect(res.orderToken).toBeTruthy();
      expect(fake.callsTo('/payment/init')).toHaveLength(2);
      expect(esperas).toEqual([1000]);
    });

    it('si Original Pay no responde tras los reintentos, devuelve 503 PAYMENTS_UNAVAILABLE', async () => {
      const { fake, client, esperas } = setup();
      fake.failNext('init', { network: true }, 5);
      expect(await codigoDe(client.initPayment(CTX, API_KEY, INIT))).toBe('PAYMENTS_UNAVAILABLE');
      expect(fake.callsTo('/payment/init')).toHaveLength(3);
      expect(esperas).toEqual([1000, 2000]);
    });

    it('process NUNCA se reintenta solo, ni siquiera ante un error de red', async () => {
      const { fake, client } = setup();
      const { orderToken } = await client.initPayment(CTX, API_KEY, INIT);
      fake.failNext('process', { network: true }, 3);
      expect(await codigoDe(client.processPayment(CTX, API_KEY, { orderToken, paymentMethod: 'stripe' }))).toBe('PAYMENTS_UNAVAILABLE');
      expect(fake.callsTo('/payment/process')).toHaveLength(1);
    });

    it('un 400 (monto bajo el mínimo) responde 422 con el mensaje y no se reintenta', async () => {
      const { fake, client } = setup();
      fake.failNext('init', { status: 400, detail: 'El monto ($5.00 MXN) es menor al mínimo de la pasarela' });
      const err = (await client.initPayment(CTX, API_KEY, INIT).catch((e) => e)) as AppError;
      expect(err).toMatchObject({ status: 422, code: 'PAYMENT_REQUEST_INVALID', message: expect.stringContaining('menor al mínimo') });
      expect(fake.callsTo('/payment/init')).toHaveLength(1);
    });

    it('una apikey rechazada (401 o 403) responde PAYMENTS_MISCONFIGURED sin revelar detalles', async () => {
      const { fake, client } = setup();
      fake.rejectKey(API_KEY);
      const err = (await client.initPayment(CTX, API_KEY, INIT).catch((e) => e)) as AppError;
      expect(err).toMatchObject({ status: 503, code: 'PAYMENTS_MISCONFIGURED' });
      expect(JSON.stringify(err)).not.toContain(API_KEY);
      expect(fake.callsTo('/payment/init')).toHaveLength(1);
    });

    it('una orden que no existe responde 404 PAYMENT_ORDER_NOT_FOUND', async () => {
      const { client } = setup();
      expect(await codigoDe(client.getStatus(CTX, API_KEY, 'ord_inexistente'))).toBe('PAYMENT_ORDER_NOT_FOUND');
    });

    it('una respuesta sin order_token es una respuesta inesperada (503 PAYMENTS_BAD_RESPONSE)', async () => {
      const { client } = setup();
      const malo = createOriginalPayClient({
        baseUrl: 'https://x.test',
        logger: createLogger('silent'),
        operationLog: createOperationLogService({ create: async () => undefined }, createLogger('silent')),
        fetchFn: (async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as typeof fetch,
      });
      expect(await codigoDe(malo.initPayment(CTX, API_KEY, INIT))).toBe('PAYMENTS_BAD_RESPONSE');
      expect(client).toBeTruthy();
    });

    it('ignora una URL de pago que no sea http(s)', async () => {
      const raro = createOriginalPayClient({
        baseUrl: 'https://x.test',
        logger: createLogger('silent'),
        operationLog: createOperationLogService({ create: async () => undefined }, createLogger('silent')),
        fetchFn: (async () => new Response(JSON.stringify({ payment_url: 'javascript:alert(1)' }), { status: 200 })) as typeof fetch,
      });
      expect((await raro.processPayment(CTX, API_KEY, { orderToken: 't', paymentMethod: 'paypal' })).paymentUrl).toBeUndefined();
    });
  });

  describe('log operativo y secretos', () => {
    it('deja una fila por llamada lógica con servicio, operación, resultado y workspace', async () => {
      const { fake, client, filas } = setup();
      fake.failNext('init', { status: 503 });
      await client.initPayment(CTX, API_KEY, INIT);
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ requestId: CTX.requestId, service: 'original-pay', operation: 'payment_init', status: 'success', workspaceId: 'ws-1' });
    });

    it('registra el código del error cuando la llamada falla', async () => {
      const { fake, client, filas } = setup();
      fake.rejectKey(API_KEY);
      await client.initPayment(CTX, API_KEY, INIT).catch(() => undefined);
      expect(filas[0]).toMatchObject({ status: 'error', errorCode: 'PAYMENTS_MISCONFIGURED' });
    });

    it('ni la apikey ni el correo del comprador llegan al log operativo', async () => {
      const { client, filas } = setup();
      await client.initPayment(CTX, API_KEY, INIT);
      expect(JSON.stringify(filas)).not.toContain(API_KEY);
      expect(JSON.stringify(filas)).not.toContain('a@b.com');
    });
  });
});
