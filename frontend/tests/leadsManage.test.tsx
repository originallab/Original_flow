import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api';
import * as leadsService from '@/services/leads';
import * as membersService from '@/services/members';
import { startDemo } from './helpers/demoApp';
import { negocioConLeads, type SeedLead } from './helpers/leadsApp';
import { montar } from './helpers/renderApp';

vi.mock('@/features/leads/constants', () => ({ SEARCH_DELAY_MS: 20 }));
vi.mock('@/services/leads', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/leads')>();
  return { ...original, createLead: vi.fn(original.createLead), updateLead: vi.fn(original.updateLead) };
});
vi.mock('@/services/members', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/members')>();
  return { ...original, listMembers: vi.fn(original.listMembers) };
});

beforeEach(() => {
  for (const fn of [leadsService.createLead, leadsService.updateLead, membersService.listMembers]) vi.mocked(fn).mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const MARIA: SeedLead = { name: 'María Pérez', email: 'maria@correo.com', phone: '55 1234 5678' };

const columna = (nombre: string) => screen.getByRole('region', { name: nombre });
const tarjetas = (nombre: string) => within(columna(nombre)).queryAllByRole('listitem');

async function abrirTablero() {
  const vista = montar('/leads');
  await screen.findByRole('region', { name: 'Nuevo' });
  return vista;
}

const escribir = async (dialogo: HTMLElement, etiqueta: string | RegExp, texto: string) => {
  const campo = within(dialogo).getByLabelText(etiqueta);
  await userEvent.clear(campo);
  if (texto) await userEvent.type(campo, texto);
};

describe('dar de alta un lead a mano', () => {
  const abrirFormulario = async () => {
    await userEvent.click(screen.getByRole('button', { name: /nuevo lead/i }));
    return screen.findByRole('dialog', { name: 'Nuevo lead' });
  };

  it('crea el lead en la primera etapa, cierra el formulario y lo muestra en el tablero', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const dialogo = await abrirFormulario();
    await escribir(dialogo, 'Nombre', 'Rosa Díaz');
    await escribir(dialogo, 'Correo', 'ROSA@correo.com');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear lead' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(tarjetas('Nuevo')).toHaveLength(2));
    expect(within(columna('Nuevo')).getByRole('button', { name: /Rosa Díaz/ })).toBeInTheDocument();
    expect(leadsService.createLead).toHaveBeenCalledTimes(1);
    expect(vi.mocked(leadsService.createLead).mock.calls[0]?.[1]).toMatchObject({ name: 'Rosa Díaz', email: 'ROSA@correo.com', source: 'web_form' });
  });

  it('el primer lead se puede dar de alta desde el aviso de que todavía no hay ninguno', async () => {
    await negocioConLeads([]);
    montar('/leads');
    expect(await screen.findByRole('heading', { name: /todavía no tienes leads/i })).toBeInTheDocument();
    const dialogo = await abrirFormulario();
    await escribir(dialogo, 'Nombre', 'Primero');
    await escribir(dialogo, 'Correo', 'primero@correo.com');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear lead' }));
    expect(await screen.findByRole('region', { name: 'Nuevo' })).toBeInTheDocument();
    await waitFor(() => expect(tarjetas('Nuevo')).toHaveLength(1));
  });

  it('propone el primer funnel y la primera etapa, y deja elegir la etapa y cómo llegó', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const dialogo = await abrirFormulario();
    // El primero de la lista (los funnels salen del más nuevo al más viejo).
    const primero = within(within(dialogo).getByLabelText('Funnel')).getAllByRole('option')[0]!.textContent!;
    expect(within(dialogo).getByLabelText('Funnel')).toHaveDisplayValue(primero);
    expect(within(dialogo).getByLabelText('Etapa')).toHaveDisplayValue('Nuevo');
    expect(within(dialogo).getByLabelText('Cómo llegó')).toHaveDisplayValue('Formulario web');

    await userEvent.selectOptions(within(dialogo).getByLabelText('Funnel'), 'Taller de ventas');
    await userEvent.selectOptions(within(dialogo).getByLabelText('Etapa'), 'Contactado');
    await userEvent.selectOptions(within(dialogo).getByLabelText('Cómo llegó'), 'WhatsApp');
    await escribir(dialogo, 'Teléfono', '+52 618 111 2233');
    await escribir(dialogo, /valor estimado/i, '1500.5');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear lead' }));

    await waitFor(() => expect(tarjetas('Contactado')).toHaveLength(1));
    const body = vi.mocked(leadsService.createLead).mock.calls[0]?.[1];
    expect(body).toMatchObject({ phone: '+52 618 111 2233', value: 1500.5, source: 'whatsapp' });
    expect(body?.name).toBeUndefined();
    expect(body?.email).toBeUndefined();
    expect(within(columna('Contactado')).getByText('Taller de ventas')).toBeInTheDocument();
  });

  it('sin correo ni teléfono avisa en el campo y no manda nada', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const dialogo = await abrirFormulario();
    await escribir(dialogo, 'Nombre', 'Solo nombre');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear lead' }));
    expect(within(dialogo).getByText('Deja un correo o un teléfono para poder contactar a la persona.')).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Correo')).toBeInvalid();
    expect(leadsService.createLead).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('valida el correo, el teléfono y el valor, y el aviso se va al corregir el campo', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const dialogo = await abrirFormulario();
    await escribir(dialogo, 'Correo', 'no-es-correo');
    await escribir(dialogo, 'Teléfono', 'abc');
    await escribir(dialogo, /valor estimado/i, '-5');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear lead' }));
    expect(within(dialogo).getByLabelText('Correo')).toBeInvalid();
    expect(within(dialogo).getByLabelText('Teléfono')).toBeInvalid();
    expect(within(dialogo).getByLabelText(/valor estimado/i)).toBeInvalid();
    expect(leadsService.createLead).not.toHaveBeenCalled();

    await escribir(dialogo, 'Correo', 'ok@correo.com');
    expect(within(dialogo).getByLabelText('Correo')).not.toBeInvalid();
  });

  it('si el servidor rechaza un campo lo muestra en ese campo y deja corregir; un fallo de red avisa y deja reintentar', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const dialogo = await abrirFormulario();
    await escribir(dialogo, 'Correo', 'ana@correo.com');

    vi.mocked(leadsService.createLead).mockRejectedValueOnce(new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'email', message: 'Ese correo no se puede usar' }]));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear lead' }));
    expect(await within(dialogo).findByText('Ese correo no se puede usar')).toBeInTheDocument();

    vi.mocked(leadsService.createLead).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'No hay conexión'));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear lead' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/no se pudo guardar/i);
    expect(within(dialogo).getByRole('button', { name: 'Crear lead' })).toBeEnabled();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear lead' }));
    await waitFor(() => expect(tarjetas('Nuevo')).toHaveLength(2));
  });

  it('un funnel o etapa que ya no existen (404) piden recargar', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const dialogo = await abrirFormulario();
    await escribir(dialogo, 'Correo', 'ana@correo.com');
    vi.mocked(leadsService.createLead).mockRejectedValueOnce(new ApiError(404, 'FUNNEL_NOT_FOUND', 'Funnel no encontrado'));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear lead' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/recarga/i);
  });

  it('mientras guarda no se puede mandar dos veces', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const dialogo = await abrirFormulario();
    await escribir(dialogo, 'Correo', 'ana@correo.com');
    let terminar: () => void = () => undefined;
    vi.mocked(leadsService.createLead).mockImplementationOnce(() => new Promise((resolver) => (terminar = () => resolver({} as leadsService.Lead))));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear lead' }));
    const guardando = await within(dialogo).findByRole('button', { name: 'Guardando…' });
    expect(guardando).toBeDisabled();
    terminar();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(leadsService.createLead).toHaveBeenCalledTimes(1);
  });

  it('Cancelar cierra el formulario sin crear nada', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const dialogo = await abrirFormulario();
    await escribir(dialogo, 'Correo', 'ana@correo.com');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(leadsService.createLead).not.toHaveBeenCalled();
  });

  it('solo lo ofrecen los roles que pueden cambiar leads (el analista solo mira)', async () => {
    await negocioConLeads([MARIA], { role: 'analista' });
    await abrirTablero();
    expect(screen.queryByRole('button', { name: /nuevo lead/i })).not.toBeInTheDocument();
  });

  it('el vendedor y el marketing manager sí lo tienen', async () => {
    await negocioConLeads([MARIA], { role: 'vendedor' });
    await abrirTablero();
    expect(screen.getByRole('button', { name: /nuevo lead/i })).toBeEnabled();
  });

  it('sin funnels no se puede dar de alta (no habría de dónde viene) y dice por qué', async () => {
    await startDemo();
    montar('/leads');
    const boton = await screen.findByRole('button', { name: /nuevo lead/i });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('title', 'Crea un funnel primero');
  });
});

describe('corregir los datos de un lead y asignarlo', () => {
  const abrirDetalle = async (nombre: string | RegExp = /María Pérez/) => {
    await userEvent.click(screen.getByRole('button', { name: nombre }));
    const dialogo = await screen.findByRole('dialog');
    return { dialogo, formulario: within(dialogo).getByRole('form', { name: 'Datos de contacto' }) };
  };

  it('muestra los datos actuales y guarda solo lo que cambió', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const { dialogo, formulario } = await abrirDetalle();
    expect(within(formulario).getByLabelText('Nombre')).toHaveValue('María Pérez');
    expect(within(formulario).getByLabelText('Correo')).toHaveValue('maria@correo.com');
    expect(within(formulario).getByLabelText('Teléfono')).toHaveValue('55 1234 5678');

    await escribir(formulario, 'Nombre', 'María P. López');
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar datos' }));
    expect(await within(formulario).findByText('Datos guardados.')).toBeInTheDocument();
    expect(vi.mocked(leadsService.updateLead).mock.calls[0]?.[2]).toEqual({ name: 'María P. López' });
    expect(within(dialogo).getByRole('heading', { name: 'María P. López' })).toBeInTheDocument();
  });

  it('el correo se compara sin importar mayúsculas: escribirlo igual con otras mayúsculas no es un cambio', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const { formulario } = await abrirDetalle();
    await escribir(formulario, 'Correo', 'MARIA@correo.com');
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar datos' }));
    expect(within(formulario).getByRole('alert')).toHaveTextContent(/no hay cambios/i);
    expect(leadsService.updateLead).not.toHaveBeenCalled();
  });

  it('un campo vaciado se borra (null) mientras quede otro dato de contacto', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const { formulario } = await abrirDetalle();
    await escribir(formulario, 'Teléfono', '');
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar datos' }));
    await within(formulario).findByText('Datos guardados.');
    expect(vi.mocked(leadsService.updateLead).mock.calls[0]?.[2]).toEqual({ phone: null });
  });

  it('no deja quitar el correo y el teléfono a la vez', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const { formulario } = await abrirDetalle();
    await escribir(formulario, 'Correo', '');
    await escribir(formulario, 'Teléfono', '');
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar datos' }));
    expect(within(formulario).getByText(/conservar/i)).toBeInTheDocument();
    expect(leadsService.updateLead).not.toHaveBeenCalled();
  });

  it('sin cambios lo dice y no manda nada', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const { formulario } = await abrirDetalle();
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar datos' }));
    expect(within(formulario).getByRole('alert')).toHaveTextContent(/no hay cambios/i);
    expect(leadsService.updateLead).not.toHaveBeenCalled();
  });

  it('valida el correo y el teléfono; el aviso se va al corregir', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const { formulario } = await abrirDetalle();
    await escribir(formulario, 'Correo', 'no-es-correo');
    await escribir(formulario, 'Teléfono', 'abc');
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar datos' }));
    expect(within(formulario).getByLabelText('Correo')).toBeInvalid();
    expect(within(formulario).getByLabelText('Teléfono')).toBeInvalid();
    expect(leadsService.updateLead).not.toHaveBeenCalled();
    await escribir(formulario, 'Correo', 'bien@correo.com');
    expect(within(formulario).getByLabelText('Correo')).not.toBeInvalid();
  });

  it('si el servidor rechaza un dato lo muestra en su campo; si falla la red avisa y deja reintentar', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const { formulario } = await abrirDetalle();
    await escribir(formulario, 'Nombre', 'Otro nombre');

    vi.mocked(leadsService.updateLead).mockRejectedValueOnce(new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'name', message: 'Nombre no permitido' }]));
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar datos' }));
    expect(await within(formulario).findByText('Nombre no permitido')).toBeInTheDocument();

    vi.mocked(leadsService.updateLead).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar datos' }));
    expect(await within(formulario).findByRole('alert')).toHaveTextContent(/no se pudo guardar/i);

    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar datos' }));
    expect(await within(formulario).findByText('Datos guardados.')).toBeInTheDocument();
  });

  it('quien administra el negocio puede asignar el lead a alguien del equipo con cuenta, y quitarlo', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const { formulario } = await abrirDetalle();
    const asignado = await within(formulario).findByLabelText('Asignado a');
    expect(asignado).toHaveDisplayValue('Sin asignar');
    expect(within(asignado).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sin asignar', 'Ana']);

    await userEvent.selectOptions(asignado, 'Ana');
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar datos' }));
    await within(formulario).findByText('Datos guardados.');
    expect(vi.mocked(leadsService.updateLead).mock.calls[0]?.[2]).toEqual({ assignedTo: 'demo-ana@correo.com' });
    expect(within(formulario).getByLabelText('Asignado a')).toHaveDisplayValue('Ana');

    await userEvent.selectOptions(within(formulario).getByLabelText('Asignado a'), 'Sin asignar');
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar datos' }));
    await waitFor(() => expect(vi.mocked(leadsService.updateLead).mock.calls[1]?.[2]).toEqual({ assignedTo: null }));
  });

  it('quien solo mueve leads (vendedor) corrige datos pero no ve el equipo ni asigna, y ni siquiera lo pide', async () => {
    await negocioConLeads([MARIA], { role: 'vendedor' });
    await abrirTablero();
    const { formulario } = await abrirDetalle();
    expect(within(formulario).getByLabelText('Nombre')).toBeInTheDocument();
    expect(within(formulario).queryByLabelText('Asignado a')).not.toBeInTheDocument();
    expect(membersService.listMembers).not.toHaveBeenCalled();
  });

  it('si no se puede cargar el equipo, el detalle sigue funcionando sin la opción de asignar', async () => {
    await negocioConLeads([MARIA]);
    vi.mocked(membersService.listMembers).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    await abrirTablero();
    const { formulario } = await abrirDetalle();
    await waitFor(() => expect(membersService.listMembers).toHaveBeenCalled());
    expect(within(formulario).queryByLabelText('Asignado a')).not.toBeInTheDocument();
    expect(within(formulario).getByLabelText('Nombre')).toBeInTheDocument();
  });

  it('el analista solo mira: no ve el formulario de datos', async () => {
    await negocioConLeads([MARIA], { role: 'analista' });
    await abrirTablero();
    await userEvent.click(screen.getByRole('button', { name: /María Pérez/ }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).queryByRole('form', { name: 'Datos de contacto' })).not.toBeInTheDocument();
    expect(membersService.listMembers).not.toHaveBeenCalled();
  });
});
