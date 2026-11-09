import type { InvitableRole, MemberRole } from '@/services/members';

/** Cómo se llama cada rol en pantalla. (Qué puede hacer cada uno se decide solo en `utils/permissions.ts`.) */
export const ROLE_LABELS: Record<MemberRole, string> = {
  super_admin: 'Superadministrador',
  client_admin: 'Administrador',
  marketing_manager: 'Marketing',
  disenador: 'Diseñador',
  vendedor: 'Vendedor',
  analista: 'Analista',
};

/** Una línea que dice qué puede hacer cada rol, para quien elige a quién invitar. Sigue la tabla de permisos de `docs/API_MVP.md`. */
export const ROLE_HINTS: Record<InvitableRole, string> = {
  client_admin: 'Gestiona el negocio y su equipo, y puede hacer todo lo demás.',
  marketing_manager: 'Crea, edita y publica funnels, y ve los leads y las métricas.',
  disenador: 'Crea y edita las páginas, sin publicarlas. No ve leads ni métricas.',
  vendedor: 'Ve y mueve los leads, y ve las métricas.',
  analista: 'Solo mira: los leads y las métricas.',
};

/** El nombre de un rol; si llega uno desconocido se muestra tal cual. */
export const roleLabel = (role: string): string => ROLE_LABELS[role as MemberRole] ?? role;
