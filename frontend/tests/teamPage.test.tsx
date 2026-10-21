import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, mockCallback } from '@/services/auth';
import { ApiError } from '@/services/api';
import * as membersService from '@/services/members';
import { ROLE_HINTS, ROLE_LABELS } from '@/shared/roles';
import { startDemo } from './helpers/demoApp';
import { editarBaseDeDemostracion, leerBaseDeDemostracion } from './helpers/publicApp';
import { montar } from './helpers/renderApp';

vi.mock('@/services/members', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/members')>();
  return { ...original, listMembers: vi.fn(original.listMembers), inviteMember: vi.fn(original.inviteMember), removeMember: vi.fn(original.removeMember) };
});

beforeEach(() => {
  for (const fn of [membersService.listMembers, membersService.inviteMember, membersService.removeMember]) vi.mocked(fn).mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

async function conNegocio(role?: string) {
  const base = await startDemo();
  if (role) {
    editarBaseDeDemostracion((db) => {
      db.workspaces[0].role = role;
    });
  }
  return base;
}
/** Una persona que ya inició sesión alguna vez (tiene cuenta), sin dejar su sesión puesta. */
async function conCuenta(email: string, name: string) {
  const { session } = await createSession();
  await mockCallback(session, { email, name });
}

const equipo = () => screen.getByRole('list', { name: 'Equipo' });
const personas = () => within(equipo()).getAllByRole('listitem');
const persona = (texto: string | RegExp) => personas().find((li) => within(li).queryByText(texto) !== null) as HTMLElement;
const formulario = () => screen.getByRole('form', { name: 'Invitar a una persona' });
const escribirCorreo = (texto: string) => userEvent.type(within(formulario()).getByLabelText('Correo'), texto);
const invitar = () => userEvent.click(within(formulario()).getByRole('button', { name: 'Invitar' }));

async function abrir() {
  const vista = montar('/equipo');
  await screen.findByRole('list', { name: 'Equipo' });
  return vista;
}

describe('acceso a la pantalla', () => {
  it.each(['super_admin', 'client_admin'])('el rol %s ve «Equipo» en el menú y la pantalla se abre desde ahí', async (rol) => {
    await conNegocio(rol);
    const { router } = montar('/funnels');
    await userEvent.click((await screen.findAllByRole('link', { name: 'Equipo' }))[0]!);
    expect(router.state.location.pathname).toBe('/equipo');
    expect(await screen.findByRole('heading', { level: 1, name: 'Equipo' })).toBeInTheDocument();
  });

  it.each(['marketing_manager', 'disenador', 'vendedor', 'analista'])('el rol %s no ve «Equipo» en el menú y, si entra por la dirección, solo ve un aviso y no se pide el equipo', async (rol) => {
    await conNegocio(rol);
    montar('/equipo');
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo el administrador del negocio gestiona el equipo.');
    expect(screen.queryByRole('link', { name: 'Equipo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Invitar a una persona' })).not.toBeInTheDocument();
    expect(membersService.listMembers).not.toHaveBeenCalled();
  });

  it('sin sesión manda a entrar', async () => {
    const { router } = montar('/equipo');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});

describe('las personas del equipo', () => {
  it('mientras carga lo avisa y luego muestra a quien creó el negocio como administrador activo, sin botón para quitarse', async () => {
    await conNegocio();
    // La carga se deja pendiente a propósito: en la demostración terminaría casi al instante y el aviso no se alcanzaría a ver.
    const real = (await vi.importActual<typeof import('@/services/members')>('@/services/members')).listMembers;
    let soltar: () => void = () => undefined;
    vi.mocked(membersService.listMembers).mockImplementationOnce((token, workspaceId, signal) => new Promise((resolver) => (soltar = () => resolver(real(token, workspaceId, signal)))));
    montar('/equipo');
    expect(await screen.findByText('Cargando el equipo…')).toBeInTheDocument();
    await waitFor(() => expect(membersService.listMembers).toHaveBeenCalled()); // el efecto pide los datos un instante después de dibujar
    soltar();
    await screen.findByRole('list', { name: 'Equipo' });
    const yo = personas()[0]!;
    expect(personas()).toHaveLength(1);
    expect(within(yo).getByText('Ana')).toBeInTheDocument();
    expect(within(yo).getByText('ana@correo.com')).toBeInTheDocument();
    expect(within(yo).getByText('(tú)')).toBeInTheDocument();
    expect(within(yo).getByText('Administrador')).toBeInTheDocument();
    expect(within(yo).getByText('Activo')).toBeInTheDocument();
    expect(within(yo).queryByRole('button', { name: /quitar/i })).not.toBeInTheDocument();
  });

  it('una persona invitada que todavía no inicia sesión se ve como «Invitado» y explica cuándo tendrá acceso', async () => {
    const { token, workspace } = await conNegocio();
    await membersService.inviteMember(token, workspace.id, { email: 'lucia@correo.com', role: 'marketing_manager' });
    await abrir();
    const lucia = persona('lucia@correo.com');
    expect(within(lucia).getByText('Marketing')).toBeInTheDocument();
    expect(within(lucia).getByText('Invitado')).toBeInTheDocument();
    expect(within(lucia).getByText(/tendrá acceso cuando entre con ese correo/i)).toBeInTheDocument();
    expect(within(lucia).getByRole('button', { name: 'Quitar a lucia@correo.com' })).toBeInTheDocument();
  });

  it('una persona con cuenta se ve activa, con su nombre y su correo', async () => {
    const { token, workspace } = await conNegocio();
    await conCuenta('beto@correo.com', 'Beto Ruiz');
    await membersService.inviteMember(token, workspace.id, { email: 'beto@correo.com', role: 'analista' });
    await abrir();
    const beto = persona('Beto Ruiz');
    expect(within(beto).getByText('beto@correo.com')).toBeInTheDocument();
    expect(within(beto).getByText('Analista')).toBeInTheDocument();
    expect(within(beto).getByText('Activo')).toBeInTheDocument();
    expect(within(beto).queryByText(/tendrá acceso cuando entre/i)).not.toBeInTheDocument();
  });

  it('lo que escribió quien invitó (el correo) se muestra como texto, nunca como HTML', async () => {
    const { workspace } = await conNegocio();
    editarBaseDeDemostracion((db) => {
      db.members.push({ id: 'm1', role: 'vendedor', status: 'invited', userId: null, email: '<img src=x onerror=alert(1)>@x.com', name: null, clientId: null, workspaceId: workspace.id, createdAt: new Date().toISOString() });
    });
    const { container } = await abrir();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>@x.com')).toBeInTheDocument();
  });

  it('si no se puede cargar avisa y deja reintentar', async () => {
    await conNegocio();
    vi.mocked(membersService.listMembers).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    montar('/equipo');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el equipo.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('list', { name: 'Equipo' });
    expect(personas()).toHaveLength(1);
  });
});

describe('invitar', () => {
  it('ofrece los cinco roles invitables con su nombre y dice qué puede hacer el elegido', async () => {
    await conNegocio();
    await abrir();
    const rol = within(formulario()).getByLabelText('Rol');
    expect(within(rol).getAllByRole('option').map((o) => o.textContent)).toEqual(['Administrador', 'Marketing', 'Diseñador', 'Vendedor', 'Analista']);
    expect(within(rol).queryByRole('option', { name: /superadministrador/i })).not.toBeInTheDocument();
    expect(rol).toHaveDisplayValue('Vendedor');
    expect(within(formulario()).getByText(ROLE_HINTS.vendedor)).toBeInTheDocument();
    await userEvent.selectOptions(rol, 'Diseñador');
    expect(within(formulario()).getByText(ROLE_HINTS.disenador)).toBeInTheDocument();
    expect(rol).toHaveAccessibleDescription(ROLE_HINTS.disenador);
  });

  it('a alguien sin cuenta lo invita: aparece como invitado, se avisa que no se manda correo y se vacía el campo', async () => {
    await conNegocio();
    await abrir();
    await userEvent.selectOptions(within(formulario()).getByLabelText('Rol'), 'Marketing');
    await escribirCorreo('  Lucia@Correo.com ');
    await invitar();
    expect(await within(formulario()).findByRole('status')).toHaveTextContent(/lucia@correo\.com todavía no tiene cuenta.*no enviamos ningún correo, avísale tú/i);
    expect(within(formulario()).getByLabelText('Correo')).toHaveValue('');
    expect(within(formulario()).getByLabelText('Rol')).toHaveDisplayValue('Marketing'); // el rol se queda para invitar a varios seguidos
    const lucia = persona('lucia@correo.com');
    expect(within(lucia).getByText('Invitado')).toBeInTheDocument();
    expect(within(lucia).getByText('Marketing')).toBeInTheDocument();
    expect(membersService.inviteMember).toHaveBeenCalledTimes(1);
    expect(vi.mocked(membersService.inviteMember).mock.calls[0]![2]).toEqual({ email: 'Lucia@Correo.com', role: 'marketing_manager' });
  });

  it('a alguien que ya tiene cuenta lo deja activo y lo dice', async () => {
    await conNegocio();
    await conCuenta('beto@correo.com', 'Beto Ruiz');
    await abrir();
    await escribirCorreo('beto@correo.com');
    await invitar();
    expect(await within(formulario()).findByRole('status')).toHaveTextContent('beto@correo.com ya tiene cuenta y tiene acceso desde ahora.');
    expect(within(persona('Beto Ruiz')).getByText('Activo')).toBeInTheDocument();
  });

  it('un correo vacío o mal escrito se marca en su campo y no se manda', async () => {
    await conNegocio();
    await abrir();
    await invitar();
    expect(within(formulario()).getByText('Escribe el correo de la persona.')).toBeInTheDocument();
    await escribirCorreo('esto-no-es-un-correo');
    await invitar();
    expect(within(formulario()).getByText('Escribe un correo válido.')).toBeInTheDocument();
    expect(within(formulario()).getByLabelText('Correo')).toBeInvalid();
    expect(membersService.inviteMember).not.toHaveBeenCalled();
  });

  it('escribir de nuevo quita el aviso del error y el del éxito anterior', async () => {
    await conNegocio();
    await abrir();
    await invitar();
    await escribirCorreo('a');
    expect(within(formulario()).queryByText('Escribe el correo de la persona.')).not.toBeInTheDocument();
    await userEvent.clear(within(formulario()).getByLabelText('Correo'));
    await escribirCorreo('luis@correo.com');
    await invitar();
    await within(formulario()).findByRole('status');
    await escribirCorreo('x');
    expect(within(formulario()).queryByRole('status')).not.toBeInTheDocument();
  });

  it('invitar a quien ya es parte del equipo o ya fue invitada se explica en el campo y la lista no cambia', async () => {
    await conNegocio();
    await abrir();
    await escribirCorreo('ana@correo.com'); // quien administra
    await invitar();
    expect(await within(formulario()).findByText('Esa persona ya es parte del equipo o ya fue invitada.')).toBeInTheDocument();
    expect(within(formulario()).getByLabelText('Correo')).toBeInvalid();
    expect(within(formulario()).getByLabelText('Correo')).toHaveValue('ana@correo.com'); // para que lo corrija
    expect(personas()).toHaveLength(1);
  });

  it('un error de validación del servidor se muestra junto a su campo', async () => {
    await conNegocio();
    await abrir();
    vi.mocked(membersService.inviteMember).mockRejectedValueOnce(new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'email', message: 'El servidor no acepta ese correo' }, { path: 'role', message: 'Rol no permitido' }], 'r'));
    await escribirCorreo('luis@correo.com');
    await invitar();
    expect(await within(formulario()).findByText('El servidor no acepta ese correo')).toBeInTheDocument();
    expect(within(formulario()).getByText('Rol no permitido')).toBeInTheDocument();
    expect(within(formulario()).getByLabelText('Rol')).toBeInvalid();
    expect(personas()).toHaveLength(1);
  });

  it('cualquier otro error se explica y se puede reintentar sin perder lo escrito', async () => {
    await conNegocio();
    await abrir();
    vi.mocked(membersService.inviteMember).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    await escribirCorreo('luis@correo.com');
    await invitar();
    expect(await within(formulario()).findByRole('alert')).toHaveTextContent('No se pudo invitar. Inténtalo de nuevo.');
    expect(within(formulario()).getByLabelText('Correo')).toHaveValue('luis@correo.com');
    await invitar();
    expect(await within(formulario()).findByRole('status')).toBeInTheDocument();
    expect(within(formulario()).queryByRole('alert')).not.toBeInTheDocument();
    expect(personas()).toHaveLength(2);
  });

  it('mientras invita el botón dice «Invitando…» y no se manda dos veces', async () => {
    await conNegocio();
    await abrir();
    vi.mocked(membersService.inviteMember).mockImplementationOnce(() => new Promise(() => undefined));
    await escribirCorreo('luis@correo.com');
    await invitar();
    const boton = await within(formulario()).findByRole('button', { name: 'Invitando…' });
    expect(boton).toBeDisabled();
    fireEvent.submit(formulario());
    expect(membersService.inviteMember).toHaveBeenCalledTimes(1);
  });
});

describe('quitar a alguien', () => {
  async function conInvitada() {
    const base = await conNegocio();
    await membersService.inviteMember(base.token, base.workspace.id, { email: 'lucia@correo.com', role: 'vendedor' });
    vi.mocked(membersService.inviteMember).mockClear();
    await abrir();
    return base;
  }
  const abrirConfirmacion = async (nombre = 'Quitar a lucia@correo.com') => {
    await userEvent.click(screen.getByRole('button', { name: nombre }));
    return screen.findByRole('dialog', { name: 'Quitar del equipo' });
  };

  it('pide confirmar, dice qué acceso pierde y, al confirmar, la quita y queda guardado', async () => {
    const { token, workspace } = await conInvitada();
    const dialogo = await abrirConfirmacion();
    expect(dialogo).toHaveTextContent(/¿Quitar a lucia@correo\.com del equipo de Academia Nimbral\? Perderá el acceso a este negocio\./);
    expect(membersService.removeMember).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(personas()).toHaveLength(1);
    expect(screen.queryByText('lucia@correo.com')).not.toBeInTheDocument();
    expect(leerBaseDeDemostracion().members).toEqual([]);
    expect(await membersService.listMembers(token, workspace.id)).toHaveLength(1);
  });

  it('«Cancelar», la X y Escape cierran sin quitar a nadie', async () => {
    await conInvitada();
    let dialogo = await abrirConfirmacion();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    dialogo = await abrirConfirmacion();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(membersService.removeMember).not.toHaveBeenCalled();
    expect(personas()).toHaveLength(2);
  });

  it('a un administrador le avisa que pierde el acceso a todos los negocios del cliente', async () => {
    const { token, workspace } = await conNegocio();
    await membersService.inviteMember(token, workspace.id, { email: 'admin@correo.com', role: 'client_admin' });
    await abrir();
    const dialogo = await abrirConfirmacion('Quitar a admin@correo.com');
    expect(dialogo).toHaveTextContent(/perderá el acceso a todos los negocios de este cliente/i);
  });

  it('si el servidor dice que es el único administrador, lo explica y la persona sigue en el equipo', async () => {
    await conInvitada();
    vi.mocked(membersService.removeMember).mockRejectedValueOnce(new ApiError(409, 'LAST_CLIENT_ADMIN', 'No se puede quitar al único administrador del cliente'));
    const dialogo = await abrirConfirmacion();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('No se puede quitar al único administrador del negocio.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(personas()).toHaveLength(2);
  });

  it('cualquier otro error se explica y se puede reintentar', async () => {
    await conInvitada();
    vi.mocked(membersService.removeMember).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    const dialogo = await abrirConfirmacion();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('No se pudo quitar. Inténtalo de nuevo.');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(personas()).toHaveLength(1);
  });

  it('si la persona ya no estaba (la quitó otro administrador) se cierra y se vuelve a pedir el equipo', async () => {
    await conInvitada();
    const llamadas = vi.mocked(membersService.listMembers).mock.calls.length;
    vi.mocked(membersService.removeMember).mockRejectedValueOnce(new ApiError(404, 'MEMBER_NOT_FOUND', 'Miembro no encontrado'));
    const dialogo = await abrirConfirmacion();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(vi.mocked(membersService.listMembers).mock.calls.length).toBe(llamadas + 1));
  });

  it('mientras la quita no se puede cerrar ni confirmar otra vez', async () => {
    await conInvitada();
    vi.mocked(membersService.removeMember).mockImplementationOnce(() => new Promise(() => undefined));
    const dialogo = await abrirConfirmacion();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }));
    const quitando = await within(dialogo).findByRole('button', { name: 'Quitando…' });
    expect(quitando).toBeDisabled();
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    // El botón queda deshabilitado y el foco sale del diálogo: se manda Escape directamente a él.
    fireEvent.keyDown(dialogo, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(membersService.removeMember).toHaveBeenCalledTimes(1);
  });
});

describe('textos de los roles', () => {
  it('todos los roles invitables tienen nombre y una línea que dice qué pueden hacer', () => {
    for (const rol of membersService.INVITABLE_ROLES) {
      expect(ROLE_LABELS[rol]).toBeTruthy();
      expect(ROLE_HINTS[rol]).toMatch(/\.$/);
    }
  });
});
