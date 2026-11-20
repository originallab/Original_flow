import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createMediaAasClient } from '../src/integrations/media-aas/client.js';
import { signRequest } from '../src/integrations/media-aas/signing.js';
import { createUnavailableMediaStore } from '../src/integrations/media-aas/unavailable.js';
import { AppError } from '../src/lib/errors.js';
import { createLogger } from '../src/lib/logger.js';
import type { OperationLogModel } from '../src/models/operationLog.model.js';
import { createOperationLogService } from '../src/services/operationLog.service.js';
import { createFakeMediaGateway, MEDIA_API_KEY, MEDIA_SECRET_KEY } from './helpers/fakeMediaGateway.js';

const NOW = 1_794_950_000_000;
const CTX = { requestId: 'req_aaaaaaaaaaaa', workspaceId: 'ws-1' };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const INPUT = { bytes: PNG, fileName: 'producto.png', mimeType: 'image/png', isPublic: true };

function setup(secret = MEDIA_SECRET_KEY) {
  const gateway = createFakeMediaGateway(() => NOW);
  const filas: Record<string, unknown>[] = [];
  const model: OperationLogModel = { create: vi.fn(async (d) => void filas.push(d as Record<string, unknown>)) };
  const logger = createLogger('silent');
  const client = createMediaAasClient({
    baseUrl: 'https://maas.ejemplo.com/',
    apiKey: MEDIA_API_KEY,
    secretKey: secret,
    logger,
    operationLog: createOperationLogService(model, logger),
    fetchFn: gateway.fetchFn,
    now: () => NOW,
  });
  return { gateway, client, filas };
}
const errorDe = async (p: Promise<unknown>) => (await p.catch((e) => e)) as AppError;

describe('firma de MediaAAS', () => {
  it('multipart: el cuerpo NO se hashea (se usa el hash del texto vacío); lo demás sí', () => {
    const vacio = createHash('sha256').update('').digest('hex');
    const esperado = `sha256=${createHmac('sha256', 's').update(`POST\n/client/upload\n7\n${vacio}`).digest('hex')}`;
    expect(signRequest('s', 'POST', '/client/upload', 7, 'multipart')).toBe(esperado);
    const cuerpo = new TextEncoder().encode('{"a":1}');
    const conCuerpo = `sha256=${createHmac('sha256', 's').update(`POST\n/client/folders/\n7\n${createHash('sha256').update(cuerpo).digest('hex')}`).digest('hex')}`;
    expect(signRequest('s', 'POST', '/client/folders/', 7, cuerpo)).toBe(conCuerpo);
  });
});

describe('cliente de MediaAAS', () => {
  it('sube una imagen con firma válida, la marca pública y devuelve el id, la clave y la dirección pública absoluta', async () => {
    const { gateway, client } = setup();
    const res = await client.upload(CTX, INPUT);
    expect(res).toEqual({ fileId: 101, s3Key: 'acme/mi-app/image/a1b2c3d4-producto.png', publicUrl: 'https://maas.ejemplo.com/public/acme/mi-app/image/a1b2c3d4-producto.png' });
    const [llamada] = gateway.calls;
    expect(llamada).toMatchObject({ method: 'POST', path: '/client/upload' });
    expect(llamada?.form?.get('file_name')).toBe('producto.png');
    expect(llamada?.form?.get('is_public')).toBe('true');
    expect(llamada?.form?.get('file')).toBeInstanceOf(Blob);
  });

  it('un archivo privado no trae dirección pública', async () => {
    const { client } = setup();
    expect((await client.upload(CTX, { ...INPUT, isPublic: false })).publicUrl).toBeNull();
  });

  it('borra un archivo por su id', async () => {
    const { gateway, client } = setup();
    await client.remove(CTX, 42);
    expect(gateway.calls[0]).toMatchObject({ method: 'DELETE', path: '/client/files/42' });
  });

  it('una credencial inválida (403) es MEDIA_MISCONFIGURED sin revelar las llaves', async () => {
    const { client } = setup('secreto_equivocado');
    const err = await errorDe(client.upload(CTX, INPUT));
    expect(err).toMatchObject({ status: 503, code: 'MEDIA_MISCONFIGURED' });
    expect(JSON.stringify(err)).not.toContain('secreto_equivocado');
  });

  it.each([
    [429, 'MEDIA_RATE_LIMITED'],
    [404, 'MEDIA_NOT_FOUND'],
    [422, 'MEDIA_REJECTED'],
    [502, 'MEDIA_UNAVAILABLE'],
  ])('un %s del servicio es %s', async (status, code) => {
    const { client, gateway } = setup();
    gateway.say(status);
    expect((await errorDe(client.upload(CTX, INPUT))).code).toBe(code);
  });

  it('una red caída es MEDIA_UNAVAILABLE; una respuesta sin file_id, MEDIA_BAD_RESPONSE', async () => {
    const a = setup();
    a.gateway.dropNext();
    expect((await errorDe(a.client.upload(CTX, INPUT))).code).toBe('MEDIA_UNAVAILABLE');
    const b = setup();
    b.gateway.say(200, { status: 'ok' });
    expect((await errorDe(b.client.upload(CTX, INPUT))).code).toBe('MEDIA_BAD_RESPONSE');
  });

  it('deja una fila en el log operativo por llamada, sin el nombre del archivo', async () => {
    const { client, filas } = setup();
    await client.upload(CTX, INPUT);
    expect(filas[0]).toMatchObject({ service: 'media-aas', operation: 'upload', status: 'success', workspaceId: 'ws-1' });
    expect(JSON.stringify(filas)).not.toContain('producto.png');
  });
});

describe('sin credenciales', () => {
  it('subir y borrar responden 503 MEDIA_NOT_CONFIGURED', async () => {
    const store = createUnavailableMediaStore();
    expect((await errorDe(store.upload(CTX, INPUT))).code).toBe('MEDIA_NOT_CONFIGURED');
    expect((await errorDe(store.remove(CTX, 1))).code).toBe('MEDIA_NOT_CONFIGURED');
  });
});
