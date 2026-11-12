/** Métodos de pago que puede aceptar un negocio. El comprador lo elige en la pantalla de Original Pay. */
export const PAYMENT_METHODS = ['stripe', 'paypal', 'mercadopago', 'spei_direct', 'webpay'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Currency = 'MXN' | 'USD' | 'CLP';

/** Datos de la petición que originó la llamada, para dejarla en el log operativo. */
export interface CallContext {
  requestId: string;
  workspaceId?: string;
}

/** Lo que pide `POST /payment/init` (guía de integración de Original Pay). */
export interface InitPaymentInput {
  amount: number;
  currency: Currency;
  /** Nuestro número de orden (`Order.orderNumber`): único y generado por esta aplicación; el aviso de pago lo trae de vuelta. */
  orderNumber: string;
  /** Producto: usamos el slug del funnel. */
  productCode: string;
  description: string;
  customerEmail: string;
}

/** Los estados con los que Original Pay avisa de un pago (`payment_status` del webhook). */
export const PAYMENT_STATUSES = ['approved', 'pending', 'rejected', 'cancelled'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
