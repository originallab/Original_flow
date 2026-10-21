import { done, fail, invalid, notFound, skip, uuid, type Answer, type DemoDb, type FunnelsContext } from './demoCore';
import { INVITABLE_ROLES, type InvitableRole, type Member } from './members';

/**
 * El equipo del negocio en la demostración (ver demo.ts), con las reglas del backend real: invitar a
 * alguien que ya es parte (o ya fue invitada) responde 409, una persona con cuenta queda activa y el
 * resto invitada, y no se puede quitar al único administrador. Lo ajeno responde 404.
 *
 * Diferencia con el backend: aquí quien creó el negocio es su dueño y tiene acceso por serlo, así que
 * no se puede quitar (responde lo mismo que al quitar al único administrador).
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL = 254;
const MAX_PAGE_SIZE = 100;

const ownerId = (workspaceId: string) => `owner-${workspaceId}`;

/** El equipo de un negocio: su dueño (administrador) y las demás personas, de la más antigua a la más nueva. */
function teamOf(db: DemoDb, workspaceId: string): Member[] {
  const workspace = db.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return [];
  const owner = Object.values(db.sessions).find((session) => session.validated && session.email === workspace.ownerEmail);
  const first: Member = {
    id: ownerId(workspace.id),
    role: 'client_admin',
    status: 'active',
    userId: `demo-${workspace.ownerEmail}`,
    email: workspace.ownerEmail,
    name: owner?.name ?? null,
    clientId: workspace.clientId,
    workspaceId: null,
    createdAt: workspace.createdAt,
  };
  // Un administrador es del cliente (vale en todos sus negocios); los demás roles, de este negocio.
  const others = db.members.filter((member) => member.workspaceId === workspace.id || (member.role === 'client_admin' && member.clientId === workspace.clientId));
  return [first, ...others.sort((a, b) => a.createdAt.localeCompare(b.createdAt))];
}

export function demoMembersRoute({ route, query, method, data, db, sessionOf, save }: FunnelsContext): Answer {
  const match = /^\/workspaces\/([^/]+)\/members(?:\/([^/]+))?$/.exec(route);
  if (!match) return skip;
  const workspaceId = decodeURIComponent(match[1] ?? '');
  const memberId = match[2] ? decodeURIComponent(match[2]) : undefined;

  const session = sessionOf();
  const workspace = db.workspaces.find((w) => w.id === workspaceId && w.ownerEmail === session.email);
  if (!workspace) throw notFound('WORKSPACE_NOT_FOUND', 'Negocio no encontrado');
  const team = teamOf(db, workspace.id);

  if (!memberId && method === 'GET') {
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.get('pageSize')) || 25));
    const page = Math.max(1, Number(query.get('page')) || 1);
    return done({ items: team.slice((page - 1) * pageSize, page * pageSize), total: team.length, page, pageSize });
  }

  if (!memberId && method === 'POST') {
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const errors: { path: string; message: string }[] = [];
    if (!EMAIL.test(email) || email.length > MAX_EMAIL) errors.push({ path: 'email', message: 'Escribe un correo válido' });
    if (!(INVITABLE_ROLES as readonly unknown[]).includes(data.role)) errors.push({ path: 'role', message: 'Elige uno de los roles de la lista' });
    if (errors.length > 0) throw invalid(errors);
    if (team.some((member) => member.email?.toLowerCase() === email)) throw fail(409, 'MEMBER_ALREADY_EXISTS', 'Esa persona ya es parte del equipo o ya fue invitada');

    // Quien ya inició sesión alguna vez tiene cuenta: queda activa de inmediato; si no, queda invitada.
    const account = Object.values(db.sessions).find((s) => s.validated && s.email === email);
    const role = data.role as InvitableRole;
    const member: Member = {
      id: uuid(),
      role,
      status: account ? 'active' : 'invited',
      userId: account ? `demo-${email}` : null,
      email,
      name: account?.name ?? null,
      clientId: role === 'client_admin' ? workspace.clientId : null,
      workspaceId: role === 'client_admin' ? null : workspace.id,
      createdAt: new Date().toISOString(),
    };
    db.members.push(member);
    save();
    return done(member);
  }

  if (memberId && method === 'DELETE') {
    const member = team.find((item) => item.id === memberId);
    if (!member) throw notFound('MEMBER_NOT_FOUND', 'Miembro no encontrado');
    const activeAdmins = team.filter((item) => item.role === 'client_admin' && item.status === 'active').length;
    if (member.id === ownerId(workspace.id) || (member.role === 'client_admin' && member.status === 'active' && activeAdmins <= 1)) {
      throw fail(409, 'LAST_CLIENT_ADMIN', 'No se puede quitar al único administrador del cliente');
    }
    db.members = db.members.filter((item) => item.id !== member.id);
    save();
    return done(undefined);
  }

  return skip;
}
