import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import type { OperationLogService } from '../../services/operationLog.service.js';
import { TIMEOUTS_MS } from './config.js';
import type { CallContext, InitPaymentInput } from './types.js';

interface Deps {
  /** URL base de Original Pay. */
  baseUrl: string;
  /** El `token_app` de la app «Original Flow»: va en el cuerpo de cada petición. */
  tokenApp?: string;
  logger: Logger;
  operationLog: OperationLogService;
  /** Inyectable para probar sin red. */
  fetchFn?: typeof fetch;
}

/** Sin respuesta (red caída, tiempo agotado) o un 5xx. */
class TransientError extends Error {}

const initResponse = z.object({ payment_url: z.string().optional(), approval_url: z.string().optional() });

function onlyHttpUrl(value: string | undefined): string | undefined {
  return value && /^https?:\/\/\S+$/i.test(value) ? value : undefined;
}

/**
 * Cliente de Original Pay según su guía de integración: `token_app` en el cuerpo (sin cabecera de
 * autenticación). Traduce lo que responde el servicio al formato de error propio del proyecto, deja cada
 * llamada en el log operativo y nunca escribe el token ni los datos del comprador en los logs.
 * El pago se confirma por el aviso (webhook) que Original Pay envía; no hay consulta de estado documentada.
 */
export function createOriginalPayClient({ baseUrl, tokenApp, logger, operationLog, fetchFn = fetch }: Deps) {
  const root = baseUrl.replace(/\/+$/, '');

  async function post(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchFn(`${root}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new TransientError('sin respuesta de Original Pay');
    }

    if (response.ok) return response.json().catch(() => ({}));
    if (response.status >= 500) throw new TransientError(`Original Pay respondió ${response.status}`);

    const errorBody = (await response.json().catch(() => null)) as { detail?: unknown; message?: unknown } | null;
    const detail = typeof errorBody?.detail === 'string' ? errorBody.detail : typeof errorBody?.message === 'string' ? errorBody.message : undefined;
    if (response.status === 400 || response.status === 422) {
      // Datos que Original Pay no acepta (por ejemplo un monto bajo el mínimo de la pasarela): el mensaje sirve a quien opera el negocio.
      throw AppError.unprocessable('PAYMENT_REQUEST_INVALID', detail ?? 'Original Pay rechazó los datos del cobro');
    }
    if (response.status === 401 || response.status === 403) {
      logger.warn('Original Pay rechazó el token_app de la aplicación', { status: response.status });
      throw AppError.serviceUnavailable('PAYMENTS_MISCONFIGURED', 'No se pudo autenticar con Original Pay; revisa las credenciales de la aplicación');
    }
    throw AppError.unprocessable('PAYMENT_REQUEST_REJECTED', 'Original Pay rechazó la petición');
  }

  return {
    /** POST /payment/init: crea la orden en Original Pay y devuelve la dirección a la que mandar a la persona a pagar. */
    async initPayment(ctx: CallContext, input: InitPaymentInput): Promise<{ paymentUrl: string }> {
      if (!tokenApp) throw AppError.serviceUnavailable('PAYMENTS_NOT_CONFIGURED', 'El servidor no tiene configuradas las credenciales de Original Pay');
      const json = await operationLog.track(
        { requestId: ctx.requestId, service: 'original-pay', operation: 'payment_init', workspaceId: ctx.workspaceId },
        async () => {
          try {
            return await post(
              '/payment/init',
              {
                token_app: tokenApp,
                amount: input.amount,
                currency: input.currency,
                order_number: input.orderNumber,
                product_code: input.productCode,
                description: input.description,
                customer_email: input.customerEmail,
              },
              TIMEOUTS_MS.init,
            );
          } catch (err) {
            if (err instanceof TransientError) {
              throw AppError.serviceUnavailable('PAYMENTS_UNAVAILABLE', 'Original Pay no responde en este momento; intenta de nuevo');
            }
            throw err;
          }
        },
        (err) => (err instanceof AppError ? err.code : 'UNKNOWN'),
      );
      const parsed = initResponse.safeParse(json);
      const paymentUrl = parsed.success ? onlyHttpUrl(parsed.data.payment_url) ?? onlyHttpUrl(parsed.data.approval_url) : undefined;
      if (!paymentUrl) throw AppError.serviceUnavailable('PAYMENTS_BAD_RESPONSE', 'Original Pay devolvió una respuesta inesperada');
      return { paymentUrl };
    },
  };
}

export type OriginalPayClient = ReturnType<typeof createOriginalPayClient>;
