import type { MembershipRole } from '../generated/prisma/client.js';
import type { MembershipModel } from '../models/membership.model.js';
import type { WorkspaceModel, WorkspaceRecord } from '../models/workspace.model.js';
import { roleInWorkspace } from './permissions.js';

/**
 * Responde una sola pregunta: ¿con qué rol accede esta persona a este workspace?
 * Lo usan todos los servicios que cuelgan de un workspace (el propio workspace, los
 * funnels...) para aplicar el mismo filtro de acceso y no repetir la lógica.
 */
export function createAccessService(workspaces: WorkspaceModel, memberships: MembershipModel) {
  return {
    /** El workspace y el rol de la persona, o null si no existe o no tiene acceso (el servicio responde 404). */
    async resolve(userId: string, workspaceId: string): Promise<{ workspace: WorkspaceRecord; role: MembershipRole } | null> {
      const [workspace, mine] = await Promise.all([workspaces.findById(workspaceId), memberships.listActiveByUser(userId)]);
      const role = workspace ? roleInWorkspace(mine, workspace) : null;
      return workspace && role ? { workspace, role } : null;
    },
  };
}

export type AccessService = ReturnType<typeof createAccessService>;
