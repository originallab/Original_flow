import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

export interface NewLead {
  funnelId: string;
  leadStageId: string;
  name?: string;
  email?: string;
  phone?: string;
  utm: Prisma.InputJsonValue;
  customFields: Prisma.InputJsonValue;
}

/** Acceso a datos de `Lead`. */
export function createLeadModel(prisma: PrismaClient) {
  return {
    /** La primera etapa del tablero del workspace (la de menor orden), o null si no tiene ninguna. */
    async firstStageId(workspaceId: string): Promise<string | null> {
      const stage = await prisma.leadStage.findFirst({ where: { workspaceId }, orderBy: { order: 'asc' }, select: { id: true } });
      return stage?.id ?? null;
    },

    /** Crea el lead y su evento `lead_created` en una sola transacción. */
    createWithEvent(lead: NewLead, eventProperties: Prisma.InputJsonValue): Promise<void> {
      return prisma.$transaction(async (tx) => {
        const created = await tx.lead.create({ data: { ...lead, source: 'web_form' }, select: { id: true } });
        await tx.event.create({
          data: { funnelId: lead.funnelId, leadId: created.id, type: 'lead_created', properties: eventProperties },
        });
      });
    },
  };
}

export type LeadModel = ReturnType<typeof createLeadModel>;
