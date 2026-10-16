import { AppError } from '../lib/errors.js';
import type { MembershipModel } from '../models/membership.model.js';
import type { UserModel } from '../models/user.model.js';

interface WorkspaceSummary {
  id: string;
  name: string;
  clientId: string;
}

export interface MeResponse {
  user: { id: string; email: string; name: string | null };
  memberships: { id: string; role: string; clientId: string | null; workspaceId: string | null }[];
  workspaces: WorkspaceSummary[];
}

export function createMeService(users: UserModel, memberships: MembershipModel) {
  return {
    /**
     * GET /me: la persona con sus membresías activas y los workspaces a los que llega:
     * el suyo (roles de workspace) o todos los de su cliente (client_admin). El
     * super_admin no lleva ninguno en particular.
     */
    async getMe(userId: string): Promise<MeResponse> {
      const user = await users.findById(userId);
      if (!user) throw AppError.unauthorized();

      const active = await memberships.listActiveByUser(userId);
      const workspaces = new Map<string, WorkspaceSummary>();
      for (const m of active) {
        if (m.workspace) workspaces.set(m.workspace.id, m.workspace);
        for (const w of m.client?.workspaces ?? []) workspaces.set(w.id, w);
      }

      return {
        user: { id: user.id, email: user.email, name: user.name },
        memberships: active.map((m) => ({ id: m.id, role: m.role, clientId: m.clientId, workspaceId: m.workspaceId })),
        workspaces: [...workspaces.values()],
      };
    },
  };
}

export type MeService = ReturnType<typeof createMeService>;
