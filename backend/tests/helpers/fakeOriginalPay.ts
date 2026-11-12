/**
 * Original Pay de mentira para las pruebas: responde lo mismo que el servicio real según su guía de
 * integración (`POST /payment/init` con `token_app` en el cuerpo y respuesta con `payment_url`) y registra cada
 * llamada. También arma los avisos de pago (webhook) que Original Pay enviaría. Las pruebas nunca hablan con
 * el servicio verdadero (playbook 04: se mockean los servicios externos).
 */
export interface FakeCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

type Failure = { network: true } | { status: number; detail?: string };

/** Las credenciales de la app «Original Flow» en las pruebas. */
export const FAKE_TOKEN_APP = 'app_token_de_prueba_123';
export const FAKE_SECRET_KEY = 'sk_secreto_de_prueba_456';

const REQUIRED = ['amount', 'currency', 'order_number', 'product_code', 'description', 'customer_email'] as const;

export function createFakeOriginalPay() {
  const calls: FakeCall[] = [];
  const failures: Failure[] = [];
  const orders = new Map<string, Record<string, unknown>>();

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchFn = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method: init?.method ?? 'GET', path: url.pathname, headers: Object.fromEntries(new Headers(init?.headers).entries()), body });

    if (url.pathname !== '/payment/init') return json(404, { detail: 'Ruta no encontrada' });

    const failure = failures.shift();
    if (failure) {
      if ('network' in failure) throw new TypeError('fetch failed');
      return json(failure.status, { error: true, detail: failure.detail ?? 'Error simulado' });
    }
    // Igual que el servicio real: primero valida los campos, después la autenticación.
    for (const field of REQUIRED) {
      if (body?.[field] === undefined || body[field] === null || body[field] === '') {
        return json(422, { error: true, error_code: 'VALIDATION_ERROR', message: `${field} is required`, detail: `${field} is required` });
      }
    }
    if (body?.token_app !== FAKE_TOKEN_APP) {
      return json(403, { error: true, error_code: 'FORBIDDEN', message: 'Invalid token_app', detail: 'Invalid token_app' });
    }
    const orderNumber = String(body.order_number);
    orders.set(orderNumber, body);
    return json(200, { success: true, payment_url: `https://pago.ejemplo.com/pay/${orderNumber}` });
  }) as typeof fetch;

  return {
    fetchFn,
    calls,
    /** La próxima llamada a `init` falla (red caída o un código HTTP). Se puede encolar varias veces. */
    failNext: (failure: Failure, times = 1) => {
      for (let i = 0; i < times; i += 1) failures.push(failure);
    },
    /** Los números de orden que Original Pay recibió en `init`. */
    orderNumbers: () => [...orders.keys()],
    /** El aviso de pago que Original Pay enviaría al servidor para esa orden. */
    webhook: (orderNumber: string, paymentStatus: 'approved' | 'pending' | 'rejected' | 'cancelled', overrides: Record<string, unknown> = {}) => {
      const order = orders.get(orderNumber);
      return {
        token_app: FAKE_TOKEN_APP,
        secret_key: FAKE_SECRET_KEY,
        order_number: orderNumber,
        payment_status: paymentStatus,
        payment_method: 'stripe',
        amount: order?.amount ?? 0,
        currency: order?.currency ?? 'MXN',
        payer_email: order?.customer_email ?? 'comprador@example.com',
        raw_data: { stripe_payment_intent: 'pi_prueba' },
        ...overrides,
      };
    },
    reset: () => {
      calls.length = 0;
      orders.clear();
      failures.length = 0;
    },
  };
}

export type FakeOriginalPay = ReturnType<typeof createFakeOriginalPay>;
