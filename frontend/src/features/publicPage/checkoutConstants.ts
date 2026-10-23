/** Cada cuánto se vuelve a preguntar si se confirmó el pago, mientras la orden sigue pendiente. */
export const ORDER_POLL_MS = 3000;
/** Cuántas veces se pregunta antes de dejar de insistir (después, la persona puede revisar a mano). */
export const MAX_ORDER_POLLS = 20;
