import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/** Acceso a datos de `OperationLog` (log operativo). Solo inserta: nunca guarda datos personales ni secretos. */
export function createOperationLogModel(prisma: PrismaClient) {
  return {
    async create(data: Prisma.OperationLogCreateInput): Promise<void> {
      await prisma.operationLog.create({ data });
    },
  };
}

export type OperationLogModel = ReturnType<typeof createOperationLogModel>;
