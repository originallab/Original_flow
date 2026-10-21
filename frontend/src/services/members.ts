import { apiFetch } from './api';

/** Los roles de una persona en un negocio (los mismos del backend). */
export type MemberRole = 'super_admin' | 'client_admin' | 'marketing_manager' | 'disenador' | 'vendedor' | 'analista';

/** Los que se pueden asignar por invitación: `super_admin` nunca se asigna desde la API. */
export const INVITABLE_ROLES = ['client_admin', 'marketing_manager', 'disenador', 'vendedor', 'analista'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/** Una persona del equipo (`GET /workspaces/:id/members`). `invited` es quien todavía no ha iniciado sesión. */
export interface Member {
  id: string;
  role: MemberRole;
  status: 'invited' | 'active';
  userId: string | null;
  email: string | null;
  name: string | null;
  clientId: string | null;
  workspaceId: string | null;
  createdAt: string;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET /workspaces/:id/members: el equipo y las invitaciones pendientes. */
export async function listMembers(token: string, workspaceId: string, signal?: AbortSignal): Promise<Member[]> {
  const page = await apiFetch<Page<Member>>(`/workspaces/${encodeURIComponent(workspaceId)}/members?pageSize=100`, { token, signal });
  return page.items;
}

/** POST /workspaces/:id/members: invita por correo con un rol. No se manda ningún correo (no existe ese servicio). */
export function inviteMember(token: string, workspaceId: string, body: { email: string; role: InvitableRole }): Promise<Member> {
  return apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}/members`, { method: 'POST', body, token });
}

/** DELETE /workspaces/:id/members/:memberId: quita el acceso. */
export function removeMember(token: string, workspaceId: string, memberId: string): Promise<void> {
  return apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE', token });
}
