import type { LeadSource, Prisma, PrismaClient } from '../generated/prisma/client.js';

export interface NewLead {
  funnelId: string;
  leadStageId: string;
  name?: string;
  email?: string;
  phone?: string;
  utm: Prisma.InputJsonValue;
  customFields: Prisma.InputJsonValue;
}

/** Un lead de alta manual: sin UTM (no vino de una página) y con su valor estimado si se sabe. */
export interface ManualLead {
  funnelId: string;
  leadStageId: string;
  name?: string;
  email?: string;
  phone?: string;
  value?: number;
  source?: LeadSource;
  customFields: Prisma.InputJsonValue;
}

export interface LeadChanges {
  leadStageId?: string;
  assignedTo?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  value?: number | null;
}

export interface LeadFilter {
  workspaceId: string;
  funnelId?: string;
  stageId?: string;
  source?: LeadSource;
  /** Texto que se busca (sin distinguir mayúsculas) en nombre, correo y teléfono. */
  q?: string;
}

/** Lo que sale por la API de un lead, con el funnel del que viene (para el nombre y para saber de qué negocio es). */
const FIELDS = {
  id: true,
  funnelId: true,
  leadStageId: true,
  name: true,
  email: true,
  phone: true,
  source: true,
  utm: true,
  assignedTo: true,
  value: true,
  customFields: true,
  createdAt: true,
  funnel: { select: { name: true, workspaceId: true } },
} satisfies Prisma.LeadSelect;

export type LeadRecord = Prisma.LeadGetPayload<{ select: typeof FIELDS }>;

/** Prisma no escapa los comodines de `contains`: `%` y `_` (y la barra que los escapa) se escriben con barra para buscarlos tal cual. */
export const literalForLike = (text: string): string => text.replace(/[\\%_]/g, (char) => `\\${char}`);

function whereOf(filter: LeadFilter): Prisma.LeadWhereInput {
  return {
    funnel: { workspaceId: filter.workspaceId },
    ...(filter.funnelId ? { funnelId: filter.funnelId } : {}),
    ...(filter.stageId ? { leadStageId: filter.stageId } : {}),
    ...(filter.source ? { source: filter.source } : {}),
    ...(filter.q
      ? {
          OR: (['name', 'email', 'phone'] as const).map((field) => ({ [field]: { contains: literalForLike(filter.q ?? ''), mode: 'insensitive' as const } })),
        }
      : {}),
  };
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

    /** Los leads de un negocio, del más nuevo al más viejo. */
    async list(filter: LeadFilter, paging: { skip: number; take: number }): Promise<{ items: LeadRecord[]; total: number }> {
      const where = whereOf(filter);
      const [items, total] = await Promise.all([
        prisma.lead.findMany({ where, select: FIELDS, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...paging }),
        prisma.lead.count({ where }),
      ]);
      return { items, total };
    },

    findById(id: string): Promise<LeadRecord | null> {
      return prisma.lead.findUnique({ where: { id }, select: FIELDS });
    },

    /** El negocio al que pertenece un funnel, o null si no existe. */
    funnelWorkspace(funnelId: string): Promise<{ id: string; workspaceId: string } | null> {
      return prisma.funnel.findUnique({ where: { id: funnelId }, select: { id: true, workspaceId: true } });
    },

    create(lead: ManualLead): Promise<LeadRecord> {
      return prisma.lead.create({ data: { ...lead, utm: {} }, select: FIELDS });
    },

    update(id: string, changes: LeadChanges): Promise<LeadRecord> {
      return prisma.lead.update({ where: { id }, data: changes, select: FIELDS });
    },
  };
}

export type LeadModel = ReturnType<typeof createLeadModel>;
