import { z } from 'zod';
import { PAYMENT_METHODS } from '../integrations/original-pay/types.js';
import { CURRENCIES } from './funnel.schemas.js';

/**
 * PUT /workspaces/:id/payments: habilita el cobro con Original Pay para el negocio (divisa y métodos).
 * Original Flow es una sola app de Original Pay, así que las credenciales son del servidor: si el cliente
 * todavía manda `apiKey` se acepta por compatibilidad, pero se descarta y nunca se guarda.
 */
export const connectPaymentsBodySchema = z.object({
  apiKey: z.string().trim().max(500).optional(),
  currency: z.enum(CURRENCIES),
  methods: z
    .array(z.enum(PAYMENT_METHODS))
    .min(1)
    .max(PAYMENT_METHODS.length)
    .refine((methods) => new Set(methods).size === methods.length, 'los métodos no se pueden repetir'),
});
export type ConnectPaymentsBody = z.infer<typeof connectPaymentsBodySchema>;

/** Forma con la que se guarda en `Workspace.paymentConfig`. Lo que traiga de más (por ejemplo una llave cifrada antigua) se ignora. */
export const storedPaymentConfigSchema = z.object({
  provider: z.literal('original_pay'),
  currency: z.enum(CURRENCIES),
  methods: z.array(z.enum(PAYMENT_METHODS)).min(1),
});
export type StoredPaymentConfig = z.infer<typeof storedPaymentConfigSchema>;
