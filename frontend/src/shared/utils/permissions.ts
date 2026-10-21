/**
 * Única fuente de verdad de los permisos en el frontend: ningún componente compara un rol
 * directamente. Es solo para decidir qué mostrar; el backend es quien manda y vuelve a comprobar
 * cada acción (ver backend/src/services/permissions.ts y docs/API_MVP.md).
 */
export type Role = 'super_admin' | 'client_admin' | 'marketing_manager' | 'disenador' | 'vendedor' | 'analista';

/** Abrir y editar funnels: super admin, administrador, marketing y diseñador. */
export function canEditFunnels(role: string | undefined): boolean {
  return role === 'super_admin' || role === 'client_admin' || role === 'marketing_manager' || role === 'disenador';
}

/** Publicar y despublicar funnels: super admin, administrador y marketing (el diseñador no). */
export function canPublishFunnels(role: string | undefined): boolean {
  return role === 'super_admin' || role === 'client_admin' || role === 'marketing_manager';
}

/** Restaurar una versión del historial: lo mismo que publicar (el diseñador guarda versiones pero no restaura). */
export function canRestoreHistory(role: string | undefined): boolean {
  return canPublishFunnels(role);
}

/** Editar los datos del negocio y gestionar su equipo: super admin y administrador del cliente. */
export function canManageWorkspace(role: string | undefined): boolean {
  return role === 'super_admin' || role === 'client_admin';
}

/** Ver los leads y el dashboard: todos menos el diseñador. */
export function canViewLeads(role: string | undefined): boolean {
  return role === 'super_admin' || role === 'client_admin' || role === 'marketing_manager' || role === 'vendedor' || role === 'analista';
}

/** Ver el dashboard: los mismos roles que ven los leads. */
export function canViewDashboard(role: string | undefined): boolean {
  return canViewLeads(role);
}

/** Mover y editar leads: lo mismo que verlos, salvo el analista, que solo mira. */
export function canManageLeads(role: string | undefined): boolean {
  return canViewLeads(role) && role !== 'analista';
}
