import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/**
 * Acceso a datos de `AuditLog`. Solo existe `create`: la tabla es de solo lectura
 * (un disparador de PostgreSQL rechaza UPDATE y DELETE) y no se agregan más escrituras.
 */
export function createAuditLogModel(prisma: PrismaClient) {
  return {
    async create(data: Prisma.AuditLogCreateInput): Promise<void> {
      await prisma.auditLog.create({ data });
    },
  };
}

export type AuditLogModel = ReturnType<typeof createAuditLogModel>;
