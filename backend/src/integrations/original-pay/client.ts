import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import type { OperationLogService } from '../../services/operationLog.service.js';
import { BACKOFF_BASE_MS, BACKOFF_JITTER_MS, RETRIES, TIMEOUTS_MS } from './config.js';
import type { CallContext, InitPaymentInput, ProcessPaymentInput, ProcessPaymentResult, RemoteOrderStatus } from './types.js';

interface Deps {
  /** URL base de Original Pay (el sandbox mientras se desarrolla). */
  baseUrl: string;
  logger: Logger;
  operationLog: OperationLogService;
  /** Inyectables para probar sin red y sin esperar los reintentos. */
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
  timeoutMs: number;
  retries: number;
}

/** Falló por red, tiempo de espera o un 5xx: se puede reintentar. */
class TransientError extends Error {}

const initResponse = z.object({ order_token: z.string().min(1) });
const processResponse = z.object({
  payment_url: z.string().optional(),
  approval_url: z.string().optional(),
  client_secret: z.string().optional(),
});
const statusResponse = z.object({ status: z.string() });

const STATUS_MAP: Record<string, RemoteOrderStatus> = {
  pendiente: 'pending',
  pagado: 'paid',
  cancelado: 'cancelled',
  // Un pago parcial no completa la compra: la orden sigue pendiente.
  parcialmente_pagado: 'pending',
};

function onlyHttpUrl(value: string | undefined): string | undefined {
  return value && /^https?:\/\/\S+$/i.test(value) ? value : undefined;
}

/**
 * Cliente de Original Pay (`apikey` en la cabecera). Traduce lo que responde el servicio al
 * formato de error propio del proyecto (playbook 08), deja cada llamada en el log operativo y
 * nunca escribe la llave ni los datos del comprador en los logs.
 */
export function createOriginalPayClient({ baseUrl, logger, operationLog, fetchFn = fetch, sleep, random = Math.random }: Deps) {
  const root = baseUrl.replace(/\/+$/, '');
  const wait = sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  /** Una sola petición. Devuelve el JSON o lanza un error ya traducido. */
  async function attempt(apiKey: string, { method, path, body, timeoutMs }: RequestOptions): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchFn(`${root}${path}`, {
        method,
        headers: { apikey: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // Sin respuesta (red caída, tiempo agotado...): puede reintentarse.
      throw new TransientError('sin respuesta de Original Pay');
    }

    if (response.ok) return response.json().catch(() => ({}));
    if (response.status >= 500) throw new TransientError(`Original Pay respondió ${response.status}`);

    const errorBody = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    const detail = typeof errorBody?.detail === 'string' ? errorBody.detail : undefined;
    if (response.status === 400) {
      // Casi siempre es un monto por debajo del mínimo de la pasarela: el mensaje sirve a quien opera el negocio.
      throw AppError.unprocessable('PAYMENT_REQUEST_INVALID', detail ?? 'Original Pay rechazó los datos del cobro');
    }
    if (response.status === 401 || response.status === 403) {
      logger.warn('Original Pay rechazó la apikey del workspace', { status: response.status });
      throw AppError.serviceUnavailable('PAYMENTS_MISCONFIGURED', 'No se pudo autenticar con Original Pay; revisa la conexión de pagos del negocio');
    }
    if (response.status === 404) throw AppError.notFound('PAYMENT_ORDER_NOT_FOUND', 'Orden de pago no encontrada en Original Pay');
    throw AppError.unprocessable('PAYMENT_REQUEST_REJECTED', 'Original Pay rechazó la petición');
  }

  /** La petición con sus reintentos y su registro en el log operativo. */
  function call(ctx: CallContext, operation: string, apiKey: string, options: RequestOptions): Promise<unknown> {
    return operationLog.track(
      { requestId: ctx.requestId, service: 'original-pay', operation, workspaceId: ctx.workspaceId },
      async () => {
        for (let tryNumber = 0; ; tryNumber += 1) {
          try {
            return await attempt(apiKey, options);
          } catch (err) {
            if (!(err instanceof TransientError)) throw err;
            if (tryNumber >= options.retries) {
              throw AppError.serviceUnavailable('PAYMENTS_UNAVAILABLE', 'Original Pay no responde en este momento; intenta de nuevo');
            }
            await wait(BACKOFF_BASE_MS * 2 ** tryNumber + random() * BACKOFF_JITTER_MS);
          }
        }
      },
      (err) => (err instanceof AppError ? err.code : 'UNKNOWN'),
    );
  }

  function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw AppError.serviceUnavailable('PAYMENTS_BAD_RESPONSE', 'Original Pay devolvió una respuesta inesperada');
    return parsed.data;
  }

  return {
    /** POST /payment/init: crea la orden (o reutiliza la pendiente del mismo comprador y producto). */
    async initPayment(ctx: CallContext, apiKey: string, input: InitPaymentInput): Promise<{ orderToken: string }> {
      const json = await call(ctx, 'payment_init', apiKey, {
        method: 'POST',
        path: '/payment/init',
        timeoutMs: TIMEOUTS_MS.init,
        retries: RETRIES.init,
        body: {
          amount: input.amount,
          currency: input.currency,
          order_number: input.orderNumber,
          product_code: input.productCode,
          description: input.description,
          customer_email: input.customerEmail,
        },
      });
      return { orderToken: parse(initResponse, json).order_token };
    },

    /** POST /payment/process: despacha el cobro a la pasarela elegida. Nunca se reintenta solo. */
    async processPayment(ctx: CallContext, apiKey: string, input: ProcessPaymentInput): Promise<ProcessPaymentResult> {
      const json = parse(
        processResponse,
        await call(ctx, 'payment_process', apiKey, {
          method: 'POST',
          path: '/payment/process',
          timeoutMs: TIMEOUTS_MS.process,
          retries: RETRIES.process,
          body: { order_token: input.orderToken, payment_method: input.paymentMethod },
        }),
      );
      return { paymentUrl: onlyHttpUrl(json.payment_url) ?? onlyHttpUrl(json.approval_url), clientSecret: json.client_secret };
    },

    /** GET /payment/data/{order_token}: el estado autoritativo de la orden. */
    async getStatus(ctx: CallContext, apiKey: string, orderToken: string): Promise<{ status: RemoteOrderStatus }> {
      const json = parse(
        statusResponse,
        await call(ctx, 'payment_status', apiKey, {
          method: 'GET',
          path: `/payment/data/${encodeURIComponent(orderToken)}`,
          timeoutMs: TIMEOUTS_MS.status,
          retries: RETRIES.status,
        }),
      );
      const status = STATUS_MAP[json.status];
      if (!status) logger.warn('Original Pay devolvió un estado desconocido', { status: json.status });
      return { status: status ?? 'pending' };
    },
  };
}

export type OriginalPayClient = ReturnType<typeof createOriginalPayClient>;
