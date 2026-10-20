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

/** Editar los datos del negocio y gestionar su equipo: super admin y administrador del cliente. */
export function canManageWorkspace(role: string | undefined): boolean {
  return role === 'super_admin' || role === 'client_admin';
}
