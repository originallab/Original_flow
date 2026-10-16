import type { CtaActionType, PrismaClient } from '../generated/prisma/client.js';

/** Acceso a datos de `CTA`. Se crean y se borran solas al guardar el contenido (ver FunnelModel.saveContent). */
export function createCtaModel(prisma: PrismaClient) {
  return {
    listByFunnel(funnelId: string) {
      return prisma.cTA.findMany({ where: { funnelId }, orderBy: { blockKey: 'asc' } });
    },

    findByBlockKey(funnelId: string, blockKey: string) {
      return prisma.cTA.findUnique({ where: { funnelId_blockKey: { funnelId, blockKey } } });
    },

    update(id: string, data: { actionType?: CtaActionType; destination?: string | null; trackingId?: string | null }) {
      return prisma.cTA.update({ where: { id }, data });
    },
  };
}

export type CtaModel = ReturnType<typeof createCtaModel>;
