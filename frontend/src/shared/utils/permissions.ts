/**
 * Única fuente de verdad de los permisos en el frontend: ningún componente compara un rol
 * directamente. Es solo para decidir qué mostrar; el backend es quien manda y vuelve a comprobar
 * cada acción (ver backend/src/services/permissions.ts y docs/API_MVP.md).
 */
export type Role = 'super_admin' | 'client_admin' | 'marketing_manager' | 'disenador' | 'vendedor' | 'analista';

/** Editar los datos del negocio y gestionar su equipo: super admin y administrador del cliente. */
export function canManageWorkspace(role: string | undefined): boolean {
  return role === 'super_admin' || role === 'client_admin';
}
