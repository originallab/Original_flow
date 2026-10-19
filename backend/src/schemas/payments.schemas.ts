import { z } from 'zod';
import { PAYMENT_METHODS } from '../integrations/original-pay/types.js';
import { CURRENCIES } from './funnel.schemas.js';

/** PUT /workspaces/:id/payments: conecta Original Pay con la apikey del negocio. */
export const connectPaymentsBodySchema = z.object({
  apiKey: z.string().trim().min(8).max(500),
  currency: z.enum(CURRENCIES),
  methods: z
    .array(z.enum(PAYMENT_METHODS))
    .min(1)
    .max(PAYMENT_METHODS.length)
    .refine((methods) => new Set(methods).size === methods.length, 'los métodos no se pueden repetir'),
});
export type ConnectPaymentsBody = z.infer<typeof connectPaymentsBodySchema>;

/** Forma con la que se guarda en `Workspace.paymentConfig` (la llave va cifrada). */
export const storedPaymentConfigSchema = z.object({
  provider: z.literal('original_pay'),
  apiKeyEnc: z.string().min(1),
  currency: z.enum(CURRENCIES),
  methods: z.array(z.enum(PAYMENT_METHODS)).min(1),
});
export type StoredPaymentConfig = z.infer<typeof storedPaymentConfigSchema>;
