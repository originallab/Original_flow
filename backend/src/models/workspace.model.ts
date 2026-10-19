import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { BrandPalette } from '../schemas/workspace.schemas.js';

/**
 * Campos de `Workspace` que pueden salir por la API. `paymentConfig` (con la llave
 * cifrada de Original Pay) NO está aquí a propósito: nunca se devuelve.
 */
const PUBLIC_FIELDS = {
  id: true,
  clientId: true,
  name: true,
  country: true,
  website: true,
  industry: true,
  logoFileId: true,
  brandPalette: true,
  createdAt: true,
} satisfies Prisma.WorkspaceSelect;

export type WorkspaceRecord = Prisma.WorkspaceGetPayload<{ select: typeof PUBLIC_FIELDS }>;

export interface StageSeed {
  name: string;
  order: number;
  isFinal: boolean;
  isWon: boolean;
}

export interface NewWorkspace {
  name: string;
  country?: string;
  website?: string;
  industry?: string;
}

export interface WorkspaceChanges {
  name?: string;
  country?: string | null;
  website?: string | null;
  industry?: string | null;
  logoFileId?: string | null;
  brandPalette?: BrandPalette | null;
}

export function createWorkspaceModel(prisma: PrismaClient) {
  return {
    findById(id: string): Promise<WorkspaceRecord | null> {
      return prisma.workspace.findUnique({ where: { id }, select: PUBLIC_FIELDS });
    },

    /**
     * La configuración de pagos tal como está guardada (con la llave cifrada). Es solo para los
     * servicios de pagos: nunca se devuelve por la API.
     */
    async findPaymentConfig(id: string): Promise<unknown> {
      const row = await prisma.workspace.findUnique({ where: { id }, select: { paymentConfig: true } });
      return row?.paymentConfig ?? null;
    },

    async setPaymentConfig(id: string, paymentConfig: Prisma.InputJsonValue): Promise<void> {
      await prisma.workspace.update({ where: { id }, data: { paymentConfig } });
    },

    /** ¿El workspace ya conectó Original Pay? Solo devuelve sí o no; la configuración nunca sale del modelo. */
    async hasPaymentsConnected(id: string): Promise<boolean> {
      const row = await prisma.workspace.findUnique({ where: { id }, select: { paymentConfig: true } });
      return row?.paymentConfig != null;
    },

    /**
     * Workspaces a los que llega una persona: todos (super_admin), los de su cliente
     * (client_admin) o el suyo (resto de roles).
     */
    async listForAccess(
      access: { all: boolean; clientIds: string[]; workspaceIds: string[] },
      paging: { skip: number; take: number },
    ): Promise<{ items: WorkspaceRecord[]; total: number }> {
      const where: Prisma.WorkspaceWhereInput = access.all
        ? {}
        : { OR: [{ clientId: { in: access.clientIds } }, { id: { in: access.workspaceIds } }] };
      const [items, total] = await Promise.all([
        prisma.workspace.findMany({ where, select: PUBLIC_FIELDS, orderBy: { createdAt: 'asc' }, ...paging }),
        prisma.workspace.count({ where }),
      ]);
      return { items, total };
    },

    /**
     * Alta del negocio en una sola transacción: el cliente (si la persona todavía no
     * tiene uno), el workspace, sus etapas de lead y, si el cliente es nuevo, la
     * membresía de administrador. O se crea todo o no se crea nada.
     */
    createWithDefaults(input: {
      ownerUserId: string;
      existingClientId?: string;
      workspace: NewWorkspace;
      stages: StageSeed[];
    }): Promise<WorkspaceRecord> {
      return prisma.$transaction(async (tx) => {
        let clientId = input.existingClientId;
        if (!clientId) {
          const client = await tx.client.create({ data: { name: input.workspace.name } });
          clientId = client.id;
          await tx.membership.create({
            data: { userId: input.ownerUserId, role: 'client_admin', status: 'active', clientId },
          });
        }
        const workspace = await tx.workspace.create({
          data: { ...input.workspace, clientId },
          select: PUBLIC_FIELDS,
        });
        await tx.leadStage.createMany({ data: input.stages.map((s) => ({ ...s, workspaceId: workspace.id })) });
        return workspace;
      });
    },

    update(id: string, changes: WorkspaceChanges): Promise<WorkspaceRecord> {
      const { brandPalette, ...rest } = changes;
      return prisma.workspace.update({
        where: { id },
        select: PUBLIC_FIELDS,
        data: {
          ...rest,
          // En Prisma, borrar un campo JSON se pide con DbNull, no con null.
          ...(brandPalette === undefined ? {} : { brandPalette: brandPalette === null ? Prisma.DbNull : brandPalette }),
        },
      });
    },
  };
}

export type WorkspaceModel = ReturnType<typeof createWorkspaceModel>;
