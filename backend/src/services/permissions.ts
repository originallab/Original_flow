import type { MembershipRole } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';

/**
 * Único lugar donde se decide qué puede hacer cada rol (playbook 02/03). Los roles
 * nunca se comparan sueltos en rutas ni en el frontend; se pregunta por una acción.
 * La matriz completa está en docs/API_MVP.md.
 */
export type Action =
  | 'workspace:read'
  | 'workspace:manage'
  | 'team:manage'
  | 'funnel:list'
  | 'funnel:edit'
  | 'funnel:delete'
  | 'funnel:publish'
  | 'history:read'
  | 'history:save'
  | 'history:restore'
  | 'analytics:read'
  | 'lead:read'
  | 'lead:manage'
  | 'stage:manage';

const PERMISSIONS: Record<Action, readonly MembershipRole[]> = {
  'workspace:read': ['super_admin', 'client_admin', 'marketing_manager', 'vendedor', 'disenador', 'analista'],
  'workspace:manage': ['super_admin', 'client_admin'],
  'team:manage': ['super_admin', 'client_admin'],
  // Todos los roles ven la lista de funnels; solo estos abren y editan el funnel completo (contenido, CTA...).
  'funnel:list': ['super_admin', 'client_admin', 'marketing_manager', 'vendedor', 'disenador', 'analista'],
  'funnel:edit': ['super_admin', 'client_admin', 'marketing_manager', 'disenador'],
  'funnel:delete': ['super_admin', 'client_admin'],
  // El diseñador edita pero no publica ni despublica.
  'funnel:publish': ['super_admin', 'client_admin', 'marketing_manager'],
  // Ver y guardar versiones lo hace quien edita; restaurar cambia la página publicada, así que solo quien publica.
  'history:read': ['super_admin', 'client_admin', 'marketing_manager', 'disenador'],
  'history:save': ['super_admin', 'client_admin', 'marketing_manager', 'disenador'],
  'history:restore': ['super_admin', 'client_admin', 'marketing_manager'],
  // El dashboard lo ve todo el que no diseña.
  'analytics:read': ['super_admin', 'client_admin', 'marketing_manager', 'vendedor', 'analista'],
  // El tablero lo ve todo el que no diseña; el analista solo mira. Las etapas del tablero las define el administrador.
  'lead:read': ['super_admin', 'client_admin', 'marketing_manager', 'vendedor', 'analista'],
  'lead:manage': ['super_admin', 'client_admin', 'marketing_manager', 'vendedor'],
  'stage:manage': ['super_admin', 'client_admin'],
};

export function can(role: MembershipRole, action: Action): boolean {
  return PERMISSIONS[action].includes(role);
}

/** La persona ve el recurso pero no puede hacer esto: 403 (a quien no lo ve se le responde 404 antes). */
export function assertCan(role: MembershipRole, action: Action): void {
  if (!can(role, action)) throw AppError.forbidden();
}

interface MembershipLike {
  role: MembershipRole;
  clientId: string | null;
  workspaceId: string | null;
}

/**
 * Rol con el que una persona accede a un workspace, o null si no tiene acceso:
 * super_admin a todos; client_admin a los de su cliente; el resto, a su workspace.
 */
export function roleInWorkspace(
  memberships: readonly MembershipLike[],
  workspace: { id: string; clientId: string },
): MembershipRole | null {
  if (memberships.some((m) => m.role === 'super_admin')) return 'super_admin';
  if (memberships.some((m) => m.role === 'client_admin' && m.clientId === workspace.clientId)) return 'client_admin';
  const own = memberships.find((m) => m.workspaceId === workspace.id);
  return own ? own.role : null;
}
