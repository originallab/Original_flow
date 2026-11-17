/**
 * Tiempos y reintentos hacia Original Pay.
 *
 * `init` espera hasta 15 s y NO se reintenta solo: el servicio de cobro decide qué hacer (la persona
 * vuelve a pulsar pagar y se reutiliza la orden). Repetirlo es seguro: Original Pay es idempotente por
 * `order_number` (comprobado en su servidor de desarrollo: responde «Orden de pago recuperada (pendiente)»
 * con la misma `payment_url`), así que más adelante se podrían agregar reintentos automáticos.
 */
export const TIMEOUTS_MS = { init: 15_000 } as const;
