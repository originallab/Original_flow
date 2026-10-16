import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/** Acceso a datos de `Event`. */
export function createEventModel(prisma: PrismaClient) {
  return {
    async createMany(funnelId: string, events: { type: string; properties: Prisma.InputJsonValue }[]): Promise<void> {
      await prisma.event.createMany({ data: events.map((e) => ({ funnelId, type: e.type, properties: e.properties })) });
    },
  };
}

export type EventModel = ReturnType<typeof createEventModel>;
