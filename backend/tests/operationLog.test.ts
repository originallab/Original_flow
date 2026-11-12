import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/lib/logger.js';
import type { OperationLogModel } from '../src/models/operationLog.model.js';
import { createOperationLogService } from '../src/services/operationLog.service.js';

const META = { requestId: 'req_abc123def456', service: 'original-pay', operation: 'payment_init', workspaceId: 'ws-1' };

function setup() {
  const filas: Record<string, unknown>[] = [];
  const model: OperationLogModel = {
    create: vi.fn(async (data) => {
      filas.push(data as Record<string, unknown>);
    }),
  };
  return { filas, model, service: createOperationLogService(model, createLogger('silent')) };
}

describe('log operativo', () => {
  it('track registra una llamada exitosa con su duración y devuelve el resultado', async () => {
    const { filas, service } = setup();
    const resultado = await service.track(META, async () => 'ok', () => 'X');
    expect(resultado).toBe('ok');
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ ...META, status: 'success', errorCode: undefined });
    expect(filas[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('track registra un fallo con su código y vuelve a lanzar el mismo error', async () => {
    const { filas, service } = setup();
    const error = new Error('falló');
    await expect(service.track(META, async () => Promise.reject(error), () => 'TIMEOUT')).rejects.toBe(error);
    expect(filas[0]).toMatchObject({ status: 'error', errorCode: 'TIMEOUT' });
  });

  it('solo guarda los campos permitidos: nada de datos personales ni secretos', async () => {
    const { filas, service } = setup();
    await service.record({ ...META, apiKey: 'app_ak_secreta', customerEmail: 'a@b.com' } as typeof META, { status: 'success', durationMs: 12 });
    expect(Object.keys(filas[0] ?? {}).sort()).toEqual(['durationMs', 'errorCode', 'operation', 'requestId', 'service', 'status', 'workspaceId']);
    expect(JSON.stringify(filas)).not.toContain('app_ak_secreta');
    expect(JSON.stringify(filas)).not.toContain('a@b.com');
  });

  it('si no se puede escribir el registro, la operación sigue y no lanza error', async () => {
    const model: OperationLogModel = { create: vi.fn().mockRejectedValue(new Error('base caída')) };
    const service = createOperationLogService(model, createLogger('silent'));
    await expect(service.track(META, async () => 42, () => 'X')).resolves.toBe(42);
  });
});
