import type { Prisma } from '../generated/prisma/client.js';
import type { Logger } from '../lib/logger.js';
import type { AuditLogModel } from '../models/auditLog.model.js';

export interface AuditEvent {
  action: string;
  resourceType: string;
  resourceId?: string;
  userId?: string;
  workspaceId?: string;
  ip?: string;
  /** Sin datos personales ni secretos: se guardan ids, nunca correos ni nombres. */
  metadata?: Prisma.InputJsonValue;
}

/**
 * Escribe en el log de auditoría. Si la escritura falla se registra el error y la
 * operación sigue: un fallo del registro no debe tumbar el login. (Para los cobros,
 * donde la auditoría es obligatoria, se decidirá aparte.)
 */
export function createAuditService(auditLogs: AuditLogModel, logger: Logger) {
  return {
    async record(event: AuditEvent): Promise<void> {
      try {
        await auditLogs.create({
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          userId: event.userId,
          workspaceId: event.workspaceId,
          ip: event.ip,
          metadata: event.metadata,
        });
      } catch (err) {
        logger.error('no se pudo escribir en AuditLog', {
          action: event.action,
          error: err instanceof Error ? err.message : 'desconocido',
        });
      }
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
