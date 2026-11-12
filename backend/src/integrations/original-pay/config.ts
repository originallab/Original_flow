/**
 * Tiempos y reintentos hacia Original Pay.
 *
 * `init` espera hasta 15 s y NO se reintenta solo: `order_number` debe ser único, así que repetir la
 * petición tras un tiempo agotado podría chocar con la orden que Original Pay sí alcanzó a crear. El
 * servicio de cobro es quien decide qué hacer (la persona vuelve a pulsar pagar y se reutiliza la orden).
 */
export const TIMEOUTS_MS = { init: 15_000 } as const;
