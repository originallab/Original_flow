/**
 * Original Pay de mentira para las pruebas: responde lo mismo que el servicio real según su
 * ficha de integración (init, process y consulta de estado) y registra cada llamada. Las pruebas
 * nunca hablan con el servicio verdadero (playbook 04: se mockean los servicios externos).
 */
export interface FakeCall {
  method: string;
  path: string;
  apiKey: string | null;
  body: Record<string, unknown> | null;
}

type Operation = 'init' | 'process' | 'status';
type Failure = { network: true } | { status: number; detail?: string };

interface FakeOrder {
  token: string;
  apiKey: string;
  email: string;
  productCode: string;
  amount: number;
  status: 'pendiente' | 'pagado' | 'cancelado' | 'parcialmente_pagado';
}

export function createFakeOriginalPay() {
  const calls: FakeCall[] = [];
  const orders = new Map<string, FakeOrder>();
  const failures: Record<Operation, Failure[]> = { init: [], process: [], status: [] };
  const invalidKeys = new Set<string>();
  let counter = 0;
  // El token de cada orden es único en la base de pruebas (que se reutiliza entre ejecuciones): `Order.opOrderToken` es único.
  const runId = Math.random().toString(36).slice(2, 8);

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchFn = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const apiKey = headers.get('apikey');
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method: init?.method ?? 'GET', path: url.pathname, apiKey, body });

    const operation: Operation | null = url.pathname === '/payment/init' ? 'init' : url.pathname === '/payment/process' ? 'process' : url.pathname.startsWith('/payment/data/') ? 'status' : null;
    if (!operation) return json(404, { detail: 'Ruta no encontrada' });

    const failure = failures[operation].shift();
    if (failure) {
      if ('network' in failure) throw new TypeError('fetch failed');
      return json(failure.status, { detail: failure.detail ?? 'Error simulado' });
    }
    if (!apiKey || invalidKeys.has(apiKey)) return json(403, { detail: 'Invalid token_app' });

    if (operation === 'init') {
      const email = String(body?.customer_email);
      const productCode = String(body?.product_code);
      // Deduplicación del servicio real: misma app, mismo comprador y mismo producto con la orden pendiente.
      const existing = [...orders.values()].find((o) => o.apiKey === apiKey && o.email === email && o.productCode === productCode && o.status === 'pendiente');
      if (existing) return json(200, { success: true, order_token: existing.token });
      counter += 1;
      const order: FakeOrder = { token: `ord_tok_${runId}_${counter}`, apiKey, email, productCode, amount: Number(body?.amount), status: 'pendiente' };
      orders.set(order.token, order);
      return json(200, { success: true, order_token: order.token, app_order_id: counter });
    }

    if (operation === 'process') {
      const order = orders.get(String(body?.order_token));
      if (!order) return json(404, { detail: 'Orden no encontrada' });
      if (body?.payment_method === 'stripe') return json(200, { success: true, client_secret: `pi_${order.token}_secret_xyz` });
      return json(200, { success: true, payment_url: `https://pago.ejemplo.com/pay/${order.token}` });
    }

    const order = orders.get(decodeURIComponent(url.pathname.replace('/payment/data/', '')));
    if (!order) return json(404, { detail: 'Orden no encontrada' });
    return json(200, { order_token: order.token, status: order.status, amount: order.amount, currency: 'MXN' });
  }) as typeof fetch;

  return {
    fetchFn,
    calls,
    callsTo: (path: string) => calls.filter((c) => c.path.startsWith(path)),
    /** La próxima llamada de esa operación falla (red caída o un código HTTP). Se puede encolar varias veces. */
    failNext: (operation: Operation, failure: Failure, times = 1) => {
      for (let i = 0; i < times; i += 1) failures[operation].push(failure);
    },
    rejectKey: (apiKey: string) => invalidKeys.add(apiKey),
    setStatus: (token: string, status: FakeOrder['status']) => {
      const order = orders.get(token);
      if (!order) throw new Error(`orden desconocida: ${token}`);
      order.status = status;
    },
    orderTokens: () => [...orders.keys()],
    reset: () => {
      calls.length = 0;
      orders.clear();
      invalidKeys.clear();
      for (const k of ['init', 'process', 'status'] as const) failures[k].length = 0;
    },
  };
}

export type FakeOriginalPay = ReturnType<typeof createFakeOriginalPay>;
