/**
 * Tiempos y reintentos hacia Original Pay (estándar de integración, secciones 11 y 12).
 *
 * - `process` espera hasta 15 s porque las pasarelas externas pueden tardar.
 * - `init` y la consulta de estado se pueden repetir sin riesgo: Original Pay deduplica las órdenes
 *   pendientes y la consulta no modifica nada. Se reintenta con espera exponencial y jitter
 *   (1 s, 2 s...), pero menos veces que el máximo de 3 del estándar, porque a veces hay una persona
 *   esperando la respuesta.
 * - `process` NUNCA se reintenta solo: antes hay que consultar el estado de la orden (regla del estándar).
 *   Esa lógica la lleva el servicio de cobro.
 */
export const TIMEOUTS_MS = { process: 15_000, init: 10_000, status: 10_000 } as const;
export const RETRIES = { init: 2, status: 1, process: 0 } as const;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_JITTER_MS = 250;
