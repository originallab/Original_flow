import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '@/services/api';

const respuesta = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.restoreAllMocks());

describe('apiFetch', () => {
  it('pide a la base de la API y devuelve el JSON', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(200, { status: 'ok' }));
    expect(await apiFetch('/health')).toEqual({ status: 'ok' });
    expect(espia.mock.calls[0]?.[0]).toBe('/api/v1/health');
  });

  it('envía el cuerpo como JSON y el token como Bearer', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(201, { ok: true }));
    await apiFetch('/workspaces', { method: 'POST', body: { name: 'Marca' }, token: 'abc' });
    const init = espia.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'Marca' }));
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', Authorization: 'Bearer abc' });
  });

  it('sin token no manda la cabecera Authorization', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(200, {}));
    await apiFetch('/funnel-types');
    expect((espia.mock.calls[0]?.[1] as RequestInit).headers).not.toHaveProperty('Authorization');
  });

  it('convierte el formato de error del backend en un ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      respuesta(422, { success: false, error: { code: 'FUNNEL_NOT_READY', message: 'No está listo', details: { missing: [] } }, requestId: 'req_1' }),
    );
    const error = (await apiFetch('/x').catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: 'FUNNEL_NOT_READY', message: 'No está listo', requestId: 'req_1' });
    expect(error.details).toEqual({ missing: [] });
  });

  it('un error sin el formato esperado da un mensaje genérico', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    const error = (await apiFetch('/x').catch((e) => e)) as ApiError;
    expect(error).toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' });
  });

  it('si no hay conexión lanza NETWORK_ERROR con un mensaje en español', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const error = (await apiFetch('/x').catch((e) => e)) as ApiError;
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(error.message).toMatch(/conectar/);
  });

  it('una respuesta 204 devuelve undefined', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    expect(await apiFetch('/auth/session/x', { method: 'DELETE' })).toBeUndefined();
  });
});
