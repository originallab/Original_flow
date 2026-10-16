import type { MembershipRole } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import { pageToSkipTake, toPage, type Page, type PaginationQuery } from '../lib/pagination.js';
import type { MembershipModel } from '../models/membership.model.js';
import type { UserModel } from '../models/user.model.js';
import type { StageSeed, WorkspaceModel, WorkspaceRecord } from '../models/workspace.model.js';
import type { CreateWorkspaceBody, InviteMemberBody, UpdateWorkspaceBody } from '../schemas/workspace.schemas.js';
import type { AuditService } from './audit.service.js';
import type { AccessService } from './access.service.js';
import type { RequestContext } from './auth.service.js';
import { assertCan, roleInWorkspace } from './permissions.js';

/** Etapas del tablero de leads que recibe todo workspace nuevo (las del prototipo). */
export const DEFAULT_LEAD_STAGES: StageSeed[] = [
  { name: 'Nuevo', order: 1, isFinal: false, isWon: false },
  { name: 'Contactado', order: 2, isFinal: false, isWon: false },
  { name: 'Interesado', order: 3, isFinal: false, isWon: false },
  { name: 'Oportunidad', order: 4, isFinal: false, isWon: false },
  { name: 'Cliente', order: 5, isFinal: true, isWon: true },
];

export type WorkspaceDto = WorkspaceRecord & { role: MembershipRole };

export interface MemberDto {
  id: string;
  role: MembershipRole;
  status: 'invited' | 'active';
  userId: string | null;
  email: string | null;
  name: string | null;
  clientId: string | null;
  workspaceId: string | null;
  createdAt: Date;
}

interface MemberRow {
  id: string;
  role: MembershipRole;
  status: 'invited' | 'active';
  userId: string | null;
  invitedEmail: string | null;
  clientId: string | null;
  workspaceId: string | null;
  createdAt: Date;
  user: { email: string; name: string | null } | null;
}

function toMemberDto(m: MemberRow): MemberDto {
  return {
    id: m.id,
    role: m.role,
    status: m.status,
    userId: m.userId,
    email: m.user?.email ?? m.invitedEmail,
    name: m.user?.name ?? null,
    clientId: m.clientId,
    workspaceId: m.workspaceId,
    createdAt: m.createdAt,
  };
}

interface Deps {
  workspaces: WorkspaceModel;
  memberships: MembershipModel;
  users: UserModel;
  access: AccessService;
  audit: AuditService;
}

export function createWorkspaceService({ workspaces, memberships, users, access, audit }: Deps) {
  /**
   * Carga el workspace y el rol con el que la persona accede a él. Si no existe o la
   * persona no tiene acceso, responde 404 (nunca 403) para no revelar que existe.
   */
  async function loadAccess(userId: string, workspaceId: string) {
    const resolved = await access.resolve(userId, workspaceId);
    if (!resolved) throw AppError.notFound('WORKSPACE_NOT_FOUND', 'Workspace no encontrado');
    return resolved;
  }

  return {
    /** GET /workspaces */
    async list(userId: string, query: PaginationQuery): Promise<Page<WorkspaceDto>> {
      const mine = await memberships.listActiveByUser(userId);
      const isSuperAdmin = mine.some((m) => m.role === 'super_admin');
      const { items, total } = await workspaces.listForAccess(
        {
          all: isSuperAdmin,
          clientIds: mine.filter((m) => m.role === 'client_admin' && m.clientId).map((m) => m.clientId as string),
          workspaceIds: mine.filter((m) => m.workspaceId).map((m) => m.workspaceId as string),
        },
        pageToSkipTake(query),
      );
      const dtos = items.flatMap((w) => {
        const role = roleInWorkspace(mine, w);
        return role ? [{ ...w, role }] : [];
      });
      return toPage(dtos, total, query);
    },

    /**
     * POST /workspaces: alta del negocio. Si la persona ya administra un cliente, el
     * workspace nuevo cuelga de él; si no, se crea su cliente y queda como administrador.
     */
    async create(userId: string, body: CreateWorkspaceBody, ctx: RequestContext): Promise<WorkspaceDto> {
      const mine = await memberships.listActiveByUser(userId);
      const ownClient = mine.find((m) => m.role === 'client_admin' && m.clientId);
      const workspace = await workspaces.createWithDefaults({
        ownerUserId: userId,
        existingClientId: ownClient?.clientId ?? undefined,
        workspace: body,
        stages: DEFAULT_LEAD_STAGES,
      });
      await audit.record({
        action: 'workspace.create',
        resourceType: 'workspace',
        resourceId: workspace.id,
        workspaceId: workspace.id,
        userId,
        ip: ctx.ip,
      });
      return { ...workspace, role: 'client_admin' };
    },

    /** GET /workspaces/:id */
    async get(userId: string, workspaceId: string): Promise<WorkspaceDto> {
      const { workspace, role } = await loadAccess(userId, workspaceId);
      return { ...workspace, role };
    },

    /** PATCH /workspaces/:id */
    async update(userId: string, workspaceId: string, body: UpdateWorkspaceBody, ctx: RequestContext): Promise<WorkspaceDto> {
      const { role } = await loadAccess(userId, workspaceId);
      assertCan(role, 'workspace:manage');
      const updated = await workspaces.update(workspaceId, body);
      await audit.record({
        action: 'workspace.update',
        resourceType: 'workspace',
        resourceId: workspaceId,
        workspaceId,
        userId,
        ip: ctx.ip,
        metadata: { fields: Object.keys(body) },
      });
      return { ...updated, role };
    },

    /** GET /workspaces/:id/members */
    async listMembers(userId: string, workspaceId: string, query: PaginationQuery): Promise<Page<MemberDto>> {
      const { workspace, role } = await loadAccess(userId, workspaceId);
      assertCan(role, 'team:manage');
      const { items, total } = await memberships.listForWorkspace(workspace, pageToSkipTake(query));
      return toPage(items.map(toMemberDto), total, query);
    },

    /**
     * POST /workspaces/:id/members: invita por correo con un rol. Si esa persona ya
     * tiene cuenta queda activa de inmediato; si no, queda invitada y se vincula
     * sola la primera vez que entre con ese correo (no hay servicio de correo).
     */
    async invite(userId: string, workspaceId: string, body: InviteMemberBody, ctx: RequestContext): Promise<MemberDto> {
      const { workspace, role } = await loadAccess(userId, workspaceId);
      assertCan(role, 'team:manage');

      if (await memberships.existsForEmail(workspace, body.email)) {
        throw AppError.conflict('MEMBER_ALREADY_EXISTS', 'Esa persona ya es parte del equipo o ya fue invitada');
      }

      const existingUser = await users.findByEmail(body.email);
      const scope = body.role === 'client_admin' ? { clientId: workspace.clientId } : { workspaceId };
      const created = await memberships.create({
        role: body.role,
        ...scope,
        ...(existingUser
          ? { status: 'active', userId: existingUser.id }
          : { status: 'invited', invitedEmail: body.email }),
      });
      await audit.record({
        action: 'member.invite',
        resourceType: 'membership',
        resourceId: created.id,
        workspaceId,
        userId,
        ip: ctx.ip,
        metadata: { role: body.role, status: created.status },
      });
      return toMemberDto(created);
    },

    /** DELETE /workspaces/:id/members/:memberId */
    async removeMember(userId: string, workspaceId: string, memberId: string, ctx: RequestContext): Promise<void> {
      const { workspace, role } = await loadAccess(userId, workspaceId);
      assertCan(role, 'team:manage');

      const member = await memberships.findInWorkspace(memberId, workspace);
      if (!member) throw AppError.notFound('MEMBER_NOT_FOUND', 'Miembro no encontrado');

      if (member.role === 'client_admin' && member.status === 'active') {
        const admins = await memberships.countActiveClientAdmins(workspace.clientId);
        if (admins <= 1) {
          throw AppError.conflict('LAST_CLIENT_ADMIN', 'No se puede quitar al único administrador del cliente');
        }
      }

      await memberships.delete(member.id);
      await audit.record({
        action: 'member.remove',
        resourceType: 'membership',
        resourceId: member.id,
        workspaceId,
        userId,
        ip: ctx.ip,
        metadata: { role: member.role },
      });
    },
  };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;
