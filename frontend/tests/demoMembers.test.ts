import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/services/api';
import { createSession, mockCallback } from '@/services/auth';
import { inviteMember, listMembers, removeMember, type Member } from '@/services/members';
import { createWorkspace } from '@/services/workspaces';

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true');
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Sin servidor'));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const falla = async (promesa: Promise<unknown>) => (await promesa.catch((e: unknown) => e)) as ApiError;
const baseDeDatos = () => JSON.parse(localStorage.getItem('of-demo-db')!) as { members: Member[] };

async function persona(email: string, name = 'Persona') {
  const { session: token } = await createSession();
  await mockCallback(token, { email, name });
  return token;
}
async function conNegocio(email = 'ana@correo.com', nombre = 'Academia Nimbral') {
  const token = await persona(email, 'Ana');
  const negocio = await createWorkspace(token, { name: nombre });
  return { token, negocio };
}

describe('modo demostración: GET /workspaces/:id/members', () => {
  it('quien creó el negocio es su administrador activo, y es el primero', async () => {
    const { token, negocio } = await conNegocio();
    const equipo = await listMembers(token, negocio.id);
    expect(equipo).toHaveLength(1);
    expect(equipo[0]).toMatchObject({
      role: 'client_admin',
      status: 'active',
      userId: 'demo-ana@correo.com',
      email: 'ana@correo.com',
      name: 'Ana',
      clientId: negocio.clientId,
      workspaceId: null,
    });
  });

  it('lista a las demás personas de la más antigua a la más nueva', async () => {
    const { token, negocio } = await conNegocio();
    await inviteMember(token, negocio.id, { email: 'uno@correo.com', role: 'vendedor' });
    await new Promise((r) => setTimeout(r, 5));
    await inviteMember(token, negocio.id, { email: 'dos@correo.com', role: 'analista' });
    expect((await listMembers(token, negocio.id)).map((m) => m.email)).toEqual(['ana@correo.com', 'uno@correo.com', 'dos@correo.com']);
  });

  it('un negocio ajeno o inexistente responde 404, nunca 403, y sin sesión 401', async () => {
    const { negocio } = await conNegocio('ana@correo.com');
    const ajeno = await persona('beto@correo.com');
    expect((await falla(listMembers(ajeno, negocio.id))).status).toBe(404);
    expect((await falla(listMembers(ajeno, 'no-existe'))).status).toBe(404);
    expect((await falla(listMembers('token-falso', negocio.id))).status).toBe(401);
  });
});

describe('modo demostración: POST /workspaces/:id/members', () => {
  it('quien todavía no tiene cuenta queda invitada, con el correo en minúsculas y sin espacios', async () => {
    const { token, negocio } = await conNegocio();
    const invitada = await inviteMember(token, negocio.id, { email: '  Lucia@Correo.COM ', role: 'marketing_manager' });
    expect(invitada).toMatchObject({ role: 'marketing_manager', status: 'invited', userId: null, email: 'lucia@correo.com', name: null, clientId: null, workspaceId: negocio.id });
    expect(invitada.id).toBeTruthy();
    expect(invitada.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await listMembers(token, negocio.id)).map((m) => m.email)).toContain('lucia@correo.com');
  });

  it('quien ya inició sesión alguna vez queda activa de inmediato, con su nombre', async () => {
    const { token, negocio } = await conNegocio();
    await persona('beto@correo.com', 'Beto Ruiz');
    const activa = await inviteMember(token, negocio.id, { email: 'beto@correo.com', role: 'vendedor' });
    expect(activa).toMatchObject({ status: 'active', userId: 'demo-beto@correo.com', name: 'Beto Ruiz' });
  });

  it('un administrador es del cliente (vale en todos sus negocios); los demás roles, solo de este negocio', async () => {
    const { token, negocio } = await conNegocio();
    const otro = await createWorkspace(token, { name: 'Segundo negocio' });
    expect(otro.clientId).toBe(negocio.clientId);
    const admin = await inviteMember(token, negocio.id, { email: 'admin@correo.com', role: 'client_admin' });
    expect(admin).toMatchObject({ clientId: negocio.clientId, workspaceId: null });
    await inviteMember(token, negocio.id, { email: 'vende@correo.com', role: 'vendedor' });
    expect((await listMembers(token, otro.id)).map((m) => m.email)).toEqual(['ana@correo.com', 'admin@correo.com']);
    expect((await listMembers(token, negocio.id)).map((m) => m.email)).toEqual(['ana@correo.com', 'admin@correo.com', 'vende@correo.com']);
  });

  it('invitar a alguien que ya es parte (sin importar mayúsculas), ya fue invitada o es quien administra responde 409', async () => {
    const { token, negocio } = await conNegocio();
    await inviteMember(token, negocio.id, { email: 'luis@correo.com', role: 'analista' });
    for (const email of ['LUIS@correo.com', ' luis@correo.com ', 'ana@correo.com', 'Ana@Correo.com']) {
      const error = await falla(inviteMember(token, negocio.id, { email, role: 'vendedor' }));
      expect(error.status, email).toBe(409);
      expect(error.code, email).toBe('MEMBER_ALREADY_EXISTS');
    }
    expect(baseDeDatos().members).toHaveLength(1);
  });

  it.each([
    [{ email: 'no-es-un-correo', role: 'vendedor' }, 'email'],
    [{ email: '', role: 'vendedor' }, 'email'],
    [{ email: 'a'.repeat(250) + '@x.com', role: 'vendedor' }, 'email'],
    [{ email: 'luis@correo.com', role: 'super_admin' }, 'role'],
    [{ email: 'luis@correo.com', role: 'rey' }, 'role'],
    [{ email: 'luis@correo.com' }, 'role'],
  ])('rechaza %o por su %s', async (cuerpo, campo) => {
    const { token, negocio } = await conNegocio();
    const error = await falla(inviteMember(token, negocio.id, cuerpo as never));
    expect(error.status).toBe(422);
    expect(error.fieldErrors()).toHaveProperty(campo);
    expect(baseDeDatos().members).toHaveLength(0);
  });

  it('un negocio ajeno responde 404 y no invita a nadie', async () => {
    const { negocio } = await conNegocio('ana@correo.com');
    const ajeno = await persona('beto@correo.com');
    expect((await falla(inviteMember(ajeno, negocio.id, { email: 'x@correo.com', role: 'vendedor' }))).status).toBe(404);
    expect(baseDeDatos().members).toHaveLength(0);
  });
});

describe('modo demostración: DELETE /workspaces/:id/members/:memberId', () => {
  it('quita a la persona y ya no sale en el equipo', async () => {
    const { token, negocio } = await conNegocio();
    const invitada = await inviteMember(token, negocio.id, { email: 'luis@correo.com', role: 'vendedor' });
    expect(await removeMember(token, negocio.id, invitada.id)).toBeUndefined();
    expect((await listMembers(token, negocio.id)).map((m) => m.email)).toEqual(['ana@correo.com']);
    // Se puede volver a invitar.
    await inviteMember(token, negocio.id, { email: 'luis@correo.com', role: 'analista' });
  });

  it('un miembro que no existe responde 404', async () => {
    const { token, negocio } = await conNegocio();
    expect((await falla(removeMember(token, negocio.id, 'no-existe'))).status).toBe(404);
  });

  it('no se puede quitar al único administrador (409 LAST_CLIENT_ADMIN)', async () => {
    const { token, negocio } = await conNegocio();
    const [yo] = await listMembers(token, negocio.id);
    const error = await falla(removeMember(token, negocio.id, yo!.id));
    expect(error.status).toBe(409);
    expect(error.code).toBe('LAST_CLIENT_ADMIN');
    expect(await listMembers(token, negocio.id)).toHaveLength(1);
  });

  it('un administrador invitado sí se puede quitar; quien creó el negocio, no, aunque haya otros', async () => {
    const { token, negocio } = await conNegocio();
    await persona('beto@correo.com');
    const admin = await inviteMember(token, negocio.id, { email: 'beto@correo.com', role: 'client_admin' });
    const [yo] = await listMembers(token, negocio.id);
    expect((await falla(removeMember(token, negocio.id, yo!.id))).code).toBe('LAST_CLIENT_ADMIN');
    await removeMember(token, negocio.id, admin.id);
    expect(await listMembers(token, negocio.id)).toHaveLength(1);
  });

  it('un administrador invitado que todavía no inició sesión no cuenta como administrador activo, pero se quita sin problema', async () => {
    const { token, negocio } = await conNegocio();
    const pendiente = await inviteMember(token, negocio.id, { email: 'pendiente@correo.com', role: 'client_admin' });
    expect(pendiente.status).toBe('invited');
    await removeMember(token, negocio.id, pendiente.id);
    expect(await listMembers(token, negocio.id)).toHaveLength(1);
  });

  it('lo de otro negocio responde 404 y no se toca', async () => {
    const { token, negocio } = await conNegocio('ana@correo.com');
    const invitada = await inviteMember(token, negocio.id, { email: 'luis@correo.com', role: 'vendedor' });
    const ajeno = await persona('beto@correo.com');
    const suyo = await createWorkspace(ajeno, { name: 'Negocio de Beto' });
    expect((await falla(removeMember(ajeno, negocio.id, invitada.id))).status).toBe(404);
    expect((await falla(removeMember(ajeno, suyo.id, invitada.id))).status).toBe(404);
    expect((await listMembers(token, negocio.id)).map((m) => m.email)).toContain('luis@correo.com');
  });
});
