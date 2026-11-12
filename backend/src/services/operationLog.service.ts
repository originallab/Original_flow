import type { Logger } from '../lib/logger.js';
import type { OperationLogModel } from '../models/operationLog.model.js';

export interface OperationMeta {
  requestId: string;
  /** Servicio al que se llama: `original-pay`, `media-aas`, `ai-engine`... */
  service: string;
  /** Operación: `payment_init`, `payment_process`, `payment_status`... */
  operation: string;
  workspaceId?: string;
}

/**
 * Log operativo (playbook 02/08): una fila por cada llamada saliente a un servicio de The Original
 * Lab, con quién la pidió (requestId), cuánto tardó y cómo terminó. Sirve para depurar y para
 * desglosar el costo por cliente. No guarda datos personales ni secretos, solo estos campos.
 * Si no se puede escribir, se registra el error y la operación sigue.
 */
export function createOperationLogService(operationLogs: OperationLogModel, logger: Logger) {
  async function record(meta: OperationMeta, outcome: { status: 'success' | 'error'; errorCode?: string; durationMs: number }) {
    try {
      await operationLogs.create({
        requestId: meta.requestId,
        service: meta.service,
        operation: meta.operation,
        workspaceId: meta.workspaceId,
        status: outcome.status,
        errorCode: outcome.errorCode,
        durationMs: Math.max(0, Math.round(outcome.durationMs)),
      });
    } catch (err) {
      logger.error('no se pudo escribir en OperationLog', {
        service: meta.service,
        operation: meta.operation,
        error: err instanceof Error ? err.message : 'desconocido',
      });
    }
  }

  return {
    record,

    /** Ejecuta una llamada midiendo su duración y dejando constancia de si salió bien o falló. */
    async track<T>(meta: OperationMeta, call: () => Promise<T>, errorCodeOf: (err: unknown) => string): Promise<T> {
      const startedAt = Date.now();
      try {
        const result = await call();
        await record(meta, { status: 'success', durationMs: Date.now() - startedAt });
        return result;
      } catch (err) {
        await record(meta, { status: 'error', errorCode: errorCodeOf(err), durationMs: Date.now() - startedAt });
        throw err;
      }
    },
  };
}

export type OperationLogService = ReturnType<typeof createOperationLogService>;
