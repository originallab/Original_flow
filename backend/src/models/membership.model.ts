import type { MembershipRole, Prisma, PrismaClient } from '../generated/prisma/client.js';

type WorkspaceRef = { id: string; clientId: string };

/** Membresías que pertenecen a un workspace: las suyas y las de administrador de su cliente. */
function scopeOf(workspace: WorkspaceRef): Prisma.MembershipWhereInput {
  return { OR: [{ workspaceId: workspace.id }, { clientId: workspace.clientId, role: 'client_admin' }] };
}

const WITH_USER = { user: { select: { email: true, name: true } } } as const;

/** Acceso a datos de `Membership`. */
export function createMembershipModel(prisma: PrismaClient) {
  return {
    /**
     * Membresías activas de un usuario, con el workspace (roles de workspace) o los
     * workspaces del cliente (rol client_admin).
     */
    listActiveByUser(userId: string) {
      return prisma.membership.findMany({
        where: { userId, status: 'active' },
        orderBy: { createdAt: 'asc' },
        include: {
          workspace: { select: { id: true, name: true, clientId: true } },
          client: { select: { workspaces: { select: { id: true, name: true, clientId: true } } } },
        },
      });
    },

    async hasActive(userId: string): Promise<boolean> {
      return (await prisma.membership.count({ where: { userId, status: 'active' } })) > 0;
    },

    /** Miembros de un workspace: los suyos y los administradores de su cliente, con su usuario si ya existe. */
    async listForWorkspace(workspace: WorkspaceRef, paging: { skip: number; take: number }) {
      const where = scopeOf(workspace);
      const [items, total] = await Promise.all([
        prisma.membership.findMany({ where, include: WITH_USER, orderBy: { createdAt: 'asc' }, ...paging }),
        prisma.membership.count({ where }),
      ]);
      return { items, total };
    },

    findInWorkspace(memberId: string, workspace: WorkspaceRef) {
      return prisma.membership.findFirst({ where: { AND: [{ id: memberId }, scopeOf(workspace)] }, include: WITH_USER });
    },

    /** ¿Ya hay una membresía de ese correo (invitado o con cuenta) en el workspace? */
    async existsForEmail(workspace: WorkspaceRef, email: string): Promise<boolean> {
      const count = await prisma.membership.count({
        where: { AND: [scopeOf(workspace), { OR: [{ invitedEmail: email }, { user: { email } }] }] },
      });
      return count > 0;
    },

    create(data: {
      role: MembershipRole;
      status: 'invited' | 'active';
      userId?: string;
      invitedEmail?: string;
      clientId?: string;
      workspaceId?: string;
    }) {
      return prisma.membership.create({ data, include: WITH_USER });
    },

    async delete(id: string): Promise<void> {
      await prisma.membership.delete({ where: { id } });
    },

    countActiveClientAdmins(clientId: string): Promise<number> {
      return prisma.membership.count({ where: { clientId, role: 'client_admin', status: 'active' } });
    },

    /**
     * Cuando alguien entra con un correo que tenía invitaciones pendientes, las
     * vincula a su usuario y las activa. Devuelve las que vinculó.
     */
    async linkPendingInvitations(email: string, userId: string) {
      const pending = await prisma.membership.findMany({ where: { invitedEmail: email, userId: null, status: 'invited' } });
      for (const m of pending) {
        await prisma.membership.update({ where: { id: m.id }, data: { userId, status: 'active' } });
      }
      return pending;
    },
  };
}

export type MembershipModel = ReturnType<typeof createMembershipModel>;
