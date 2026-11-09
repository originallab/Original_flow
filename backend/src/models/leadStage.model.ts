import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { insertionIndex, withPlaced } from '../lib/leadStages.js';

const FIELDS = { id: true, workspaceId: true, name: true, order: true, isFinal: true, isWon: true } satisfies Prisma.LeadStageSelect;

export type LeadStageRecord = Prisma.LeadStageGetPayload<{ select: typeof FIELDS }>;

/**
 * Deja las etapas con los órdenes 1, 2, 3… según `ids`. El orden es único por negocio, así que primero
 * pasan todas a valores negativos distintos y luego a los definitivos: nunca chocan a mitad del camino.
 */
async function renumber(tx: Prisma.TransactionClient, ids: readonly string[]): Promise<void> {
  for (const [index, id] of ids.entries()) await tx.leadStage.update({ where: { id }, data: { order: -(index + 1) } });
  for (const [index, id] of ids.entries()) await tx.leadStage.update({ where: { id }, data: { order: index + 1 } });
}

/** Acceso a datos de `LeadStage`. Agregar, mover y quitar etapas dejan siempre los órdenes seguidos (1, 2, 3…), en una transacción. */
export function createLeadStageModel(prisma: PrismaClient) {
  return {
    list(workspaceId: string): Promise<LeadStageRecord[]> {
      return prisma.leadStage.findMany({ where: { workspaceId }, orderBy: { order: 'asc' }, select: FIELDS });
    },

    findById(id: string): Promise<LeadStageRecord | null> {
      return prisma.leadStage.findUnique({ where: { id }, select: FIELDS });
    },

    countLeads(stageId: string): Promise<number> {
      return prisma.lead.count({ where: { leadStageId: stageId } });
    },

    /** Agrega una etapa en la posición pedida (o justo antes de la final); la etapa final siempre queda al final. */
    create(workspaceId: string, name: string, order?: number): Promise<LeadStageRecord> {
      return prisma.$transaction(async (tx) => {
        const stages = await tx.leadStage.findMany({ where: { workspaceId }, orderBy: { order: 'asc' }, select: { id: true, isFinal: true } });
        // El orden 0 no lo usa ninguna etapa; `renumber` lo reemplaza enseguida.
        const created = await tx.leadStage.create({ data: { workspaceId, name, order: 0 }, select: { id: true, isFinal: true } });
        await renumber(tx, withPlaced(stages.map((s) => s.id), created.id, insertionIndex(stages, order)));
        return tx.leadStage.findUniqueOrThrow({ where: { id: created.id }, select: FIELDS });
      });
    },

    rename(id: string, name: string): Promise<LeadStageRecord> {
      return prisma.leadStage.update({ where: { id }, data: { name }, select: FIELDS });
    },

    /** Mueve una etapa a otra posición (1 es la primera); nunca después de la final. */
    move(workspaceId: string, id: string, order: number): Promise<LeadStageRecord> {
      return prisma.$transaction(async (tx) => {
        const stages = await tx.leadStage.findMany({ where: { workspaceId }, orderBy: { order: 'asc' }, select: { id: true, isFinal: true } });
        const others = stages.filter((stage) => stage.id !== id);
        await renumber(tx, withPlaced(others.map((s) => s.id), id, insertionIndex(others, order)));
        return tx.leadStage.findUniqueOrThrow({ where: { id }, select: FIELDS });
      });
    },

    /** Quita una etapa y cierra el hueco que deja. Falla (clave foránea) si todavía tiene leads. */
    remove(workspaceId: string, id: string): Promise<void> {
      return prisma.$transaction(async (tx) => {
        await tx.leadStage.delete({ where: { id } });
        const rest = await tx.leadStage.findMany({ where: { workspaceId }, orderBy: { order: 'asc' }, select: { id: true } });
        await renumber(tx, rest.map((s) => s.id));
      });
    },
  };
}

export type LeadStageModel = ReturnType<typeof createLeadStageModel>;
