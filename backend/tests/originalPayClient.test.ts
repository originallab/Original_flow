import { describe, expect, it, vi } from 'vitest';
import { createOriginalPayClient } from '../src/integrations/original-pay/client.js';
import { AppError } from '../src/lib/errors.js';
import { createLogger } from '../src/lib/logger.js';
import type { OperationLogModel } from '../src/models/operationLog.model.js';
import { createOperationLogService } from '../src/services/operationLog.service.js';
import { createFakeOriginalPay, FAKE_TOKEN_APP } from './helpers/fakeOriginalPay.js';

const CTX = { requestId: 'req_aaaaaaaaaaaa', workspaceId: 'ws-1' };
const INIT = { amount: 4200, currency: 'MXN' as const, orderNumber: 'OF-1', productCode: 'curso-de-datos', description: 'Curso', customerEmail: 'a@b.com' };

function setup(tokenApp: string | null = FAKE_TOKEN_APP) {
  const fake = createFakeOriginalPay();
  const filas: Record<string, unknown>[] = [];
  const model: OperationLogModel = { create: vi.fn(async (d) => void filas.push(d as Record<string, unknown>)) };
  const logger = createLogger('silent');
  const client = createOriginalPayClient({
    baseUrl: 'https://api-test.origpay.com/',
    tokenApp: tokenApp ?? undefined,
    logger,
    operationLog: createOperationLogService(model, logger),
    fetchFn: fake.fetchFn,
  });
  return { fake, client, filas };
}

/** Un cliente cuyo servicio responde siempre lo mismo. */
function respondiendo(cuerpo: unknown, status = 200) {
  return createOriginalPayClient({
    baseUrl: 'https://x.test',
    tokenApp: FAKE_TOKEN_APP,
    logger: createLogger('silent'),
    operationLog: createOperationLogService({ create: async () => undefined }, createLogger('silent')),
    fetchFn: (async () => new Response(JSON.stringify(cuerpo), { status })) as typeof fetch,
  });
}

const codigoDe = async (promesa: Promise<unknown>) => ((await promesa.catch((e) => e)) as AppError).code;

describe('cliente de Original Pay (guía de integración)', () => {
  it('init manda el token_app en el cuerpo, con los nombres de Original Pay y sin cabecera de autenticación, y devuelve la dirección de pago', async () => {
    const { fake, client } = setup();
    const res = await client.initPayment(CTX, INIT);
    expect(res).toEqual({ paymentUrl: 'https://pago.ejemplo.com/pay/OF-1' });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({
      method: 'POST',
      path: '/payment/init',
      body: { token_app: FAKE_TOKEN_APP, amount: 4200, currency: 'MXN', order_number: 'OF-1', product_code: 'curso-de-datos', description: 'Curso', customer_email: 'a@b.com' },
    });
    expect(fake.calls[0]?.headers).not.toHaveProperty('apikey');
    expect(fake.calls[0]?.headers).not.toHaveProperty('authorization');
  });

  it('sin token_app configurado responde 503 PAYMENTS_NOT_CONFIGURED y no llama al servicio', async () => {
    const { fake, client } = setup(null);
    expect(await codigoDe(client.initPayment(CTX, INIT))).toBe('PAYMENTS_NOT_CONFIGURED');
    expect(fake.calls).toHaveLength(0);
  });

  describe('errores', () => {
    it('init NO se reintenta solo (order_number es único): un error de red es 503 PAYMENTS_UNAVAILABLE con una sola llamada', async () => {
      const { fake, client } = setup();
      fake.failNext({ network: true }, 3);
      expect(await codigoDe(client.initPayment(CTX, INIT))).toBe('PAYMENTS_UNAVAILABLE');
      expect(fake.calls).toHaveLength(1);
    });

    it('un 5xx también es 503 PAYMENTS_UNAVAILABLE sin reintentar', async () => {
      const { fake, client } = setup();
      fake.failNext({ status: 503 });
      expect(await codigoDe(client.initPayment(CTX, INIT))).toBe('PAYMENTS_UNAVAILABLE');
      expect(fake.calls).toHaveLength(1);
    });

    it('un 422 o un 400 (monto bajo el mínimo, campo faltante) responde 422 con el mensaje', async () => {
      const { fake, client } = setup();
      fake.failNext({ status: 400, detail: 'El monto ($5.00 MXN) es menor al mínimo de la pasarela' });
      const err = (await client.initPayment(CTX, INIT).catch((e) => e)) as AppError;
      expect(err).toMatchObject({ status: 422, code: 'PAYMENT_REQUEST_INVALID', message: expect.stringContaining('menor al mínimo') });
      const vacio = (await client.initPayment(CTX, { ...INIT, description: '' }).catch((e) => e)) as AppError;
      expect(vacio).toMatchObject({ status: 422, code: 'PAYMENT_REQUEST_INVALID', message: 'description is required' });
    });

    it('un token_app rechazado (403 Invalid token_app) responde PAYMENTS_MISCONFIGURED sin revelar el token', async () => {
      const { client } = setup('app_token_equivocado');
      const err = (await client.initPayment(CTX, INIT).catch((e) => e)) as AppError;
      expect(err).toMatchObject({ status: 503, code: 'PAYMENTS_MISCONFIGURED' });
      expect(JSON.stringify(err)).not.toContain('app_token_equivocado');
    });

    it('una respuesta sin payment_url es una respuesta inesperada (503 PAYMENTS_BAD_RESPONSE)', async () => {
      expect(await codigoDe(respondiendo({ success: true }).initPayment(CTX, INIT))).toBe('PAYMENTS_BAD_RESPONSE');
    });

    it('una dirección de pago que no sea http(s) se rechaza', async () => {
      expect(await codigoDe(respondiendo({ payment_url: 'javascript:alert(1)' }).initPayment(CTX, INIT))).toBe('PAYMENTS_BAD_RESPONSE');
    });

    it('acepta approval_url como alternativa a payment_url', async () => {
      expect(await respondiendo({ approval_url: 'https://pago.ejemplo.com/aprobar' }).initPayment(CTX, INIT)).toEqual({ paymentUrl: 'https://pago.ejemplo.com/aprobar' });
    });
  });

  describe('log operativo y secretos', () => {
    it('deja una fila por llamada con servicio, operación, resultado y workspace', async () => {
      const { client, filas } = setup();
      await client.initPayment(CTX, INIT);
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ requestId: CTX.requestId, service: 'original-pay', operation: 'payment_init', status: 'success', workspaceId: 'ws-1' });
    });

    it('registra el código del error cuando la llamada falla', async () => {
      const { client, filas } = setup('app_token_equivocado');
      await client.initPayment(CTX, INIT).catch(() => undefined);
      expect(filas[0]).toMatchObject({ status: 'error', errorCode: 'PAYMENTS_MISCONFIGURED' });
    });

    it('ni el token_app ni el correo del comprador llegan al log operativo', async () => {
      const { client, filas } = setup();
      await client.initPayment(CTX, INIT);
      expect(JSON.stringify(filas)).not.toContain(FAKE_TOKEN_APP);
      expect(JSON.stringify(filas)).not.toContain('a@b.com');
    });
  });
});
