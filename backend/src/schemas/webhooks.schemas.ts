import { z } from 'zod';
import { PAYMENT_STATUSES } from '../integrations/original-pay/types.js';

/**
 * Aviso de pago de Original Pay (`POST /webhooks/original-pay`). Misma estructura para todos los métodos de pago.
 * `token_app` y `secret_key` lo autentican; `order_number` es el número de orden que esta aplicación generó.
 */
export const paymentWebhookBodySchema = z.object({
  token_app: z.string().min(1).max(200),
  secret_key: z.string().min(1).max(200),
  order_number: z.string().min(1).max(100),
  payment_status: z.enum(PAYMENT_STATUSES),
  payment_method: z.string().max(50).optional(),
  amount: z.coerce.number().min(0),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  payer_email: z.string().max(254).optional(),
  // Datos propios de cada pasarela: no se usan ni se guardan.
  raw_data: z.unknown().optional(),
});
export type PaymentWebhookBody = z.infer<typeof paymentWebhookBodySchema>;
