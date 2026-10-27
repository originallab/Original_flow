import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/** Una versión sin su copia (pesa mucho y solo hace falta al restaurar), con quién la guardó. */
const ENTRY_FIELDS = {
  id: true,
  funnelId: true,
  label: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.FunnelHistorySelect;

export type HistoryEntryRecord = Prisma.FunnelHistoryGetPayload<{ select: typeof ENTRY_FIELDS }>;

/** Acceso a datos de `FunnelHistory`. Restaurar vive en el modelo de funnel porque cambia el funnel y sus CTA. */
export function createFunnelHistoryModel(prisma: PrismaClient) {
  return {
    /** Las versiones de un funnel, de la más nueva a la más vieja. */
    async list(funnelId: string, paging: { skip: number; take: number }): Promise<{ items: HistoryEntryRecord[]; total: number }> {
      const [items, total] = await Promise.all([
        prisma.funnelHistory.findMany({ where: { funnelId }, select: ENTRY_FIELDS, orderBy: { createdAt: 'desc' }, ...paging }),
        prisma.funnelHistory.count({ where: { funnelId } }),
      ]);
      return { items, total };
    },

    create(funnelId: string, userId: string, label: string, snapshot: Prisma.InputJsonValue): Promise<HistoryEntryRecord> {
      return prisma.funnelHistory.create({ data: { funnelId, userId, label, snapshot }, select: ENTRY_FIELDS });
    },

    /** Una versión de ESTE funnel con su copia; con otro `historyId` o de otro funnel no existe. */
    findWithSnapshot(funnelId: string, historyId: string) {
      return prisma.funnelHistory.findFirst({ where: { id: historyId, funnelId }, select: { id: true, label: true, snapshot: true } });
    },
  };
}

export type FunnelHistoryModel = ReturnType<typeof createFunnelHistoryModel>;
