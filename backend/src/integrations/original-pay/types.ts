/** Métodos de pago que ofrece Original Pay (ficha de integración del playbook). */
export const PAYMENT_METHODS = ['stripe', 'paypal', 'mercadopago', 'spei_direct', 'webpay'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Currency = 'MXN' | 'USD' | 'CLP';

/** Datos de la petición que originó la llamada, para dejarla en el log operativo. */
export interface CallContext {
  requestId: string;
  workspaceId?: string;
}

export interface InitPaymentInput {
  amount: number;
  currency: Currency;
  /** Nuestro número de orden (`Order.orderNumber`). */
  orderNumber: string;
  /** Producto: usamos el slug del funnel. */
  productCode: string;
  description: string;
  customerEmail: string;
}

export interface ProcessPaymentInput {
  orderToken: string;
  paymentMethod: PaymentMethod;
}

export interface ProcessPaymentResult {
  /** Dirección a la que mandar a la persona a pagar (MercadoPago, PayPal...). */
  paymentUrl?: string;
  /** Secreto que el navegador necesita para completar el cobro con Stripe. No se guarda. */
  clientSecret?: string;
}

/** Estado de una orden, ya traducido a los valores propios de Original Flow. */
export type RemoteOrderStatus = 'pending' | 'paid' | 'cancelled';
