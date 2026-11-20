import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * MediaAAS de mentira: verifica la firma HMAC-SHA256 como el servicio real (recalculándola por su cuenta; en multipart
 * el cuerpo no se hashea) y responde lo que dice su documentación técnica.
 */
export const MEDIA_API_KEY = 'ak_media_de_prueba';
export const MEDIA_SECRET_KEY = 'sk_media_de_prueba';

export interface MediaCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  form: FormData | null;
}

type Reply = { status: number; json?: unknown } | { network: true };

export function createFakeMediaGateway(clock: () => number = Date.now) {
  const calls: MediaCall[] = [];
  const replies: Reply[] = [];
  let nextId = 100;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchFn = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const form = init?.body instanceof FormData ? init.body : null;
    calls.push({ method, path: url.pathname + url.search, headers, form });

    const next = replies.shift();
    if (next && 'network' in next) throw new TypeError('fetch failed');
    if (next) return json(next.status, next.json ?? { detail: 'Error simulado' });

    if (!headers['x-api-key'] || !headers['x-timestamp'] || !headers['x-signature']) return json(401, { detail: 'Faltan headers' });
    if (headers['x-api-key'] !== MEDIA_API_KEY) return json(403, { detail: 'API Key desactivada o no existe' });
    const timestamp = Number(headers['x-timestamp']);
    if (!Number.isFinite(timestamp) || Math.abs(clock() / 1000 - timestamp) > 300) return json(403, { detail: 'Timestamp fuera de ventana' });
    const bodyHash = createHash('sha256').update('').digest('hex'); // multipart y DELETE: cuerpo vacío
    const canonical = `${method}\n${url.pathname + url.search}\n${timestamp}\n${bodyHash}`;
    const expected = `sha256=${createHmac('sha256', MEDIA_SECRET_KEY).update(canonical).digest('hex')}`;
    const received = headers['x-signature'];
    if (received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return json(403, { detail: 'Firma inválida' });

    if (method === 'POST' && url.pathname === '/client/upload') {
      const isPublic = form?.get('is_public') === 'true';
      const name = String(form?.get('file_name') ?? 'archivo');
      nextId += 1;
      const key = `acme/mi-app/image/a1b2c3d4-${name}`;
      return json(200, { status: 'ok', file_id: nextId, s3_key: key, original_name: name, media_type: 'image', is_public: isPublic, media_url: `/client/media/${key}`, public_url: isPublic ? `/public/${key}` : null });
    }
    if (method === 'DELETE' && url.pathname.startsWith('/client/files/')) return json(200, { status: 'ok' });
    return json(404, { detail: 'Ruta no encontrada' });
  }) as typeof fetch;

  return {
    fetchFn,
    calls,
    say: (status: number, body?: unknown) => void replies.push({ status, json: body }),
    dropNext: () => void replies.push({ network: true }),
    reset: () => {
      calls.length = 0;
      replies.length = 0;
    },
  };
}
