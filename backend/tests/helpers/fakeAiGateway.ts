import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Gateway de IA Engine de mentira: verifica la firma HMAC-SHA256 igual que el servicio real (guía de
 * integración) —recalculándola por su cuenta, sin usar el código que se prueba— y responde con lo que se le
 * indique. Así las pruebas detectan una firma mal calculada aunque no se hable con el servicio verdadero.
 */
export const GW_API_KEY = 'ak_de_prueba_gateway';
export const GW_SECRET_KEY = 'sk_de_prueba_gateway';

export interface GatewayCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  rawBody: string;
  body: { model?: string; messages?: { role: string; content: string }[]; metadata?: Record<string, string> } & Record<string, unknown>;
}

type Reply = { status: number; json?: unknown } | { network: true };

export function createFakeAiGateway(clock: () => number = Date.now) {
  const calls: GatewayCall[] = [];
  const replies: Reply[] = [];

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const completion = (content: string, finishReason = 'stop') => ({
    id: 'chatcmpl-prueba',
    object: 'chat.completion',
    model: 'gpt-5.4-mini-2026-03-17',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    fallback: false,
  });

  const fetchFn = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const rawBody = init?.body ? new TextDecoder().decode(init.body as Uint8Array) : '';
    calls.push({ method: init?.method ?? 'GET', path: url.pathname + url.search, headers, rawBody, body: rawBody ? JSON.parse(rawBody) : {} });

    const next = replies.shift();
    if (next && 'network' in next) throw new TypeError('fetch failed');

    // Autenticación, igual que el servicio: api_key, ventana de 5 minutos y firma sobre el mensaje canónico.
    const timestamp = Number(headers['x-timestamp']);
    if (!headers['x-api-key'] || !headers['x-timestamp'] || !headers['x-signature']) return json(401, { detail: 'Faltan headers de firma' });
    if (headers['x-api-key'] !== GW_API_KEY) return json(404, { detail: 'Proyecto no encontrado' });
    if (!Number.isFinite(timestamp) || Math.abs(clock() / 1000 - timestamp) > 300) return json(403, { detail: 'Timestamp fuera de ventana' });
    const canonical = `${init?.method ?? 'GET'}\n${url.pathname + url.search}\n${timestamp}\n${createHash('sha256').update(rawBody).digest('hex')}`;
    const expected = `sha256=${createHmac('sha256', GW_SECRET_KEY).update(canonical).digest('hex')}`;
    const received = headers['x-signature'];
    if (received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return json(403, { detail: 'Firma inválida' });

    return next ? json(next.status, next.json ?? { detail: 'Error simulado' }) : json(200, completion('{}'));
  }) as typeof fetch;

  return {
    fetchFn,
    calls,
    /** La próxima respuesta del modelo (texto que el modelo «escribe»). Se encolan en orden. */
    say: (content: string | object, finishReason = 'stop') =>
      void replies.push({ status: 200, json: completion(typeof content === 'string' ? content : JSON.stringify(content), finishReason) }),
    /** La próxima respuesta es un error HTTP. */
    fail: (status: number, body: unknown = { detail: 'Error simulado' }) => void replies.push({ status, json: body }),
    /** La próxima llamada no recibe respuesta (red caída). */
    dropNext: () => void replies.push({ network: true }),
    reset: () => {
      calls.length = 0;
      replies.length = 0;
    },
  };
}

export type FakeAiGateway = ReturnType<typeof createFakeAiGateway>;
