import type { Issue } from './blocks/types';
import { EMAIL, type Utm } from './leads';

/** Los métodos de pago de Original Pay (los mismos del backend, `integrations/original-pay/types.ts`). */
export const PAYMENT_METHODS = ['stripe', 'paypal', 'mercadopago', 'spei_direct', 'webpay'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  stripe: 'Tarjeta de crédito o débito',
  paypal: 'PayPal',
  mercadopago: 'Mercado Pago',
  spei_direct: 'Transferencia SPEI',
  webpay: 'Webpay',
};

export const PAYMENT_CURRENCIES = ['MXN', 'USD', 'CLP'] as const;

const PHONE = /^[0-9+()\-.\s]{6,30}$/;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Lo que manda la página al comprar (`POST /public/funnels/:slug/checkout`). El monto nunca viaja: sale del precio del funnel. */
export interface CheckoutBody {
  name: string;
  email: string;
  phone?: string;
  paymentMethod?: PaymentMethod;
  consent: boolean;
  utm?: Utm;
}

/** Las reglas del backend para una compra: nombre y correo obligatorios, teléfono opcional y consentimiento exactamente `true`. */
export function validateCheckout(body: unknown): Issue[] {
  if (!isObject(body)) return [{ path: [], message: 'Datos inválidos.' }];
  const issues: Issue[] = [];
  const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string).trim() : undefined);
  const name = text('name');
  if (name === undefined || name.length < 1 || name.length > 200) issues.push({ path: ['name'], message: 'Escribe tu nombre (hasta 200 caracteres).' });
  const email = text('email')?.toLowerCase();
  if (email === undefined || !EMAIL.test(email) || email.length > 254) issues.push({ path: ['email'], message: 'Escribe un correo válido.' });
  if (body.phone !== undefined && body.phone !== '' && !(typeof body.phone === 'string' && PHONE.test(body.phone.trim()))) issues.push({ path: ['phone'], message: 'Escribe un teléfono válido.' });
  if (body.paymentMethod !== undefined && !(PAYMENT_METHODS as readonly unknown[]).includes(body.paymentMethod)) issues.push({ path: ['paymentMethod'], message: 'Elige una forma de pago de la lista.' });
  if (body.consent !== true) issues.push({ path: ['consent'], message: 'Debes aceptar el tratamiento de tus datos para continuar.' });
  return issues;
}

/** La clave de idempotencia de una compra: de 8 a 64 caracteres. Con la misma clave, un reintento nunca cobra dos veces. */
export const isIdempotencyKey = (value: unknown): value is string => typeof value === 'string' && value.length >= 8 && value.length <= 64;

/** Lo que se manda para conectar Original Pay en un negocio (`PUT /workspaces/:id/payments`). */
export interface PaymentsConnection {
  apiKey: string;
  currency: (typeof PAYMENT_CURRENCIES)[number];
  methods: PaymentMethod[];
}

/** Las reglas del backend para conectar Pay: llave de 8 a 500 caracteres, una divisa y de uno a cinco métodos sin repetir. */
export function validateConnection(body: unknown): Issue[] {
  if (!isObject(body)) return [{ path: [], message: 'Datos inválidos.' }];
  const issues: Issue[] = [];
  const key = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (key.length < 8 || key.length > 500) issues.push({ path: ['apiKey'], message: 'La llave debe tener entre 8 y 500 caracteres.' });
  if (!(PAYMENT_CURRENCIES as readonly unknown[]).includes(body.currency)) issues.push({ path: ['currency'], message: 'Elige una divisa de la lista.' });
  const methods = body.methods;
  if (!Array.isArray(methods) || methods.length < 1 || methods.length > PAYMENT_METHODS.length || !methods.every((m) => (PAYMENT_METHODS as readonly unknown[]).includes(m))) {
    issues.push({ path: ['methods'], message: 'Elige al menos una forma de pago.' });
  } else if (new Set(methods).size !== methods.length) {
    issues.push({ path: ['methods'], message: 'Las formas de pago no se pueden repetir.' });
  }
  return issues;
}
