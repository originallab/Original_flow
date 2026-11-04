import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api';
import * as leadsService from '@/services/leads';
import { negocioConLeads, type SeedLead } from './helpers/leadsApp';
import { montar } from './helpers/renderApp';

vi.mock('@/features/leads/constants', () => ({ SEARCH_DELAY_MS: 20 }));
vi.mock('@/services/leads', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/leads')>();
  return {
    ...original,
    listLeadStages: vi.fn(original.listLeadStages),
    createStage: vi.fn(original.createStage),
    updateStage: vi.fn(original.updateStage),
    deleteStage: vi.fn(original.deleteStage),
  };
});

beforeEach(() => {
  for (const fn of [leadsService.listLeadStages, leadsService.createStage, leadsService.updateStage, leadsService.deleteStage]) vi.mocked(fn).mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const MARIA: SeedLead = { name: 'María Pérez', email: 'maria@correo.com' };

/** Los nombres de las columnas del tablero, de izquierda a derecha. */
const columnas = () => screen.getAllByRole('region').map((region) => region.querySelector('h2,h3')?.textContent);
async function abrirTablero(gente: SeedLead[] = [MARIA], opciones?: { role?: string }) {
  await negocioConLeads(gente, opciones);
  const vista = montar('/leads');
  await screen.findByRole('region', { name: 'Nuevo' });
  return vista;
}
async function abrirEtapas() {
  await userEvent.click(screen.getByRole('button', { name: 'Etapas' }));
  return screen.findByRole('dialog', { name: 'Etapas del tablero' });
}
/** Los nombres de las etapas en el cuadro, de arriba abajo. */
const nombres = (dialogo: HTMLElement) => within(within(dialogo).getByRole('list', { name: 'Etapas del tablero' })).getAllByRole('textbox').map((campo) => (campo as HTMLInputElement).value);

describe('quién administra las etapas', () => {
  it('el administrador tiene el botón «Etapas»; el vendedor y el analista no', async () => {
    await abrirTablero();
    expect(screen.getByRole('button', { name: 'Etapas' })).toBeInTheDocument();
  });

  it('un vendedor no ve el botón (solo quien administra el negocio cambia las etapas)', async () => {
    await abrirTablero([MARIA], { role: 'vendedor' });
    expect(screen.queryByRole('button', { name: 'Etapas' })).not.toBeInTheDocument();
  });

  it('un analista tampoco', async () => {
    await abrirTablero([MARIA], { role: 'analista' });
    expect(screen.queryByRole('button', { name: 'Etapas' })).not.toBeInTheDocument();
  });

  it('lista las etapas en orden, con la última marcada y sin poder moverse ni quitarse', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    expect(nombres(dialogo)).toEqual(['Nuevo', 'Contactado', 'Interesado', 'Oportunidad', 'Cliente']);
    expect(within(dialogo).getByText(/última etapa/i)).toBeInTheDocument();
    for (const accion of ['Subir', 'Bajar', 'Quitar']) expect(within(dialogo).getByRole('button', { name: `${accion} Cliente` })).toBeDisabled();
    expect(within(dialogo).getByRole('button', { name: 'Quitar Cliente' })).toHaveAttribute('title', 'Esta etapa no se puede quitar');
  });

  it('la primera no sube y la que está justo antes de la última no baja', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    expect(within(dialogo).getByRole('button', { name: 'Subir Nuevo' })).toBeDisabled();
    expect(within(dialogo).getByRole('button', { name: 'Bajar Nuevo' })).toBeEnabled();
    expect(within(dialogo).getByRole('button', { name: 'Subir Oportunidad' })).toBeEnabled();
    expect(within(dialogo).getByRole('button', { name: 'Bajar Oportunidad' })).toBeDisabled();
  });
});

describe('agregar una etapa', () => {
  it('entra justo antes de la última, vacía el campo y aparece como columna del tablero', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    await userEvent.type(within(dialogo).getByLabelText('Nueva etapa'), '  Propuesta enviada ');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar etapa' }));

    await waitFor(() => expect(nombres(dialogo)).toEqual(['Nuevo', 'Contactado', 'Interesado', 'Oportunidad', 'Propuesta enviada', 'Cliente']));
    expect(within(dialogo).getByLabelText('Nueva etapa')).toHaveValue('');
    expect(vi.mocked(leadsService.createStage).mock.calls[0]?.[2]).toEqual({ name: 'Propuesta enviada' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Listo' }));
    expect(columnas()).toEqual(['Nuevo', 'Contactado', 'Interesado', 'Oportunidad', 'Propuesta enviada', 'Cliente']);
  });

  it('un nombre vacío o demasiado largo avisa y no manda nada', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar etapa' }));
    expect(within(dialogo).getByLabelText('Nueva etapa')).toBeInvalid();
    await userEvent.type(within(dialogo).getByLabelText('Nueva etapa'), 'a'.repeat(61));
    expect(within(dialogo).getByLabelText('Nueva etapa')).not.toBeInvalid();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar etapa' }));
    expect(within(dialogo).getByText(/hasta 60/)).toBeInTheDocument();
    expect(leadsService.createStage).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza el nombre lo muestra en el campo y lo conserva', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    await userEvent.type(within(dialogo).getByLabelText('Nueva etapa'), 'Repetida');
    vi.mocked(leadsService.createStage).mockRejectedValueOnce(new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'name', message: 'Ese nombre no se puede usar' }]));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar etapa' }));
    expect(await within(dialogo).findByText('Ese nombre no se puede usar')).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Nueva etapa')).toHaveValue('Repetida');
  });

  it('un fallo de red avisa y deja volver a intentar', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    await userEvent.type(within(dialogo).getByLabelText('Nueva etapa'), 'Nueva');
    vi.mocked(leadsService.createStage).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar etapa' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/no se pudo guardar/i);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar etapa' }));
    await waitFor(() => expect(nombres(dialogo)).toContain('Nueva'));
    expect(within(dialogo).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un permiso que falta (403) lo dice con claridad', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    await userEvent.type(within(dialogo).getByLabelText('Nueva etapa'), 'Nueva');
    vi.mocked(leadsService.createStage).mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'No tienes permiso'));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar etapa' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/solo quien administra/i);
  });
});

describe('renombrar y mover', () => {
  it('«Guardar» solo se activa si el nombre cambió; renombra y actualiza el tablero', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    const guardar = within(dialogo).getByRole('form', { name: 'Renombrar Contactado' });
    expect(within(guardar).getByRole('button', { name: 'Guardar' })).toBeDisabled();
    const campo = within(guardar).getByLabelText('Nombre de la etapa 2');
    await userEvent.clear(campo);
    await userEvent.type(campo, '  Primer contacto ');
    await userEvent.click(within(guardar).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(nombres(dialogo)).toContain('Primer contacto'));
    expect(vi.mocked(leadsService.updateStage).mock.calls[0]?.[2]).toEqual({ name: 'Primer contacto' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Listo' }));
    expect(columnas()).toContain('Primer contacto');
  });

  it('un nombre vacío no se manda; el aviso se va al escribir', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    const campo = within(dialogo).getByLabelText('Nombre de la etapa 2');
    await userEvent.clear(campo);
    await userEvent.type(campo, 'x');
    await userEvent.clear(campo);
    await userEvent.click(within(within(dialogo).getByRole('form', { name: 'Renombrar Contactado' })).getByRole('button', { name: 'Guardar' }));
    expect(campo).toBeInvalid();
    expect(leadsService.updateStage).not.toHaveBeenCalled();
    await userEvent.type(campo, 'Otro');
    expect(campo).not.toBeInvalid();
  });

  it('si el servidor rechaza el nombre lo muestra en su campo', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    const campo = within(dialogo).getByLabelText('Nombre de la etapa 2');
    await userEvent.type(campo, ' bis');
    vi.mocked(leadsService.updateStage).mockRejectedValueOnce(new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'name', message: 'Nombre no permitido' }]));
    await userEvent.click(within(within(dialogo).getByRole('form', { name: 'Renombrar Contactado' })).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialogo).findByText('Nombre no permitido')).toBeInTheDocument();
  });

  it('subir y bajar cambian el orden de las columnas', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Subir Interesado' }));
    await waitFor(() => expect(nombres(dialogo)).toEqual(['Nuevo', 'Interesado', 'Contactado', 'Oportunidad', 'Cliente']));
    expect(vi.mocked(leadsService.updateStage).mock.calls[0]?.[2]).toEqual({ order: 2 });

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Bajar Nuevo' }));
    await waitFor(() => expect(nombres(dialogo)).toEqual(['Interesado', 'Nuevo', 'Contactado', 'Oportunidad', 'Cliente']));
    expect(vi.mocked(leadsService.updateStage).mock.calls[1]?.[2]).toEqual({ order: 2 });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Listo' }));
    expect(columnas()).toEqual(['Interesado', 'Nuevo', 'Contactado', 'Oportunidad', 'Cliente']);
  });

  it('mientras hay un cambio en curso no se puede empezar otro', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    let terminar: () => void = () => undefined;
    vi.mocked(leadsService.updateStage).mockImplementationOnce(() => new Promise((resolver) => (terminar = () => resolver({} as leadsService.LeadStage))));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Subir Interesado' }));
    await waitFor(() => expect(within(dialogo).getByRole('button', { name: 'Bajar Nuevo' })).toBeDisabled());
    expect(within(dialogo).getByRole('button', { name: 'Agregar etapa' })).toBeDisabled();
    terminar();
    await waitFor(() => expect(within(dialogo).getByRole('button', { name: 'Agregar etapa' })).toBeEnabled());
  });

  it('si el cambio se guardó pero la lista no se pudo actualizar, lo avisa', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    vi.mocked(leadsService.listLeadStages).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Subir Interesado' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/se guardó, pero no se pudo actualizar/i);
  });
});

describe('quitar una etapa', () => {
  it('pide confirmar; al confirmar la quita y la columna desaparece', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar Contactado' }));
    const confirmar = within(dialogo).getByRole('group', { name: 'Confirmar quitar Contactado' });
    expect(within(confirmar).getByText('¿Quitar «Contactado»?')).toBeInTheDocument();
    expect(leadsService.deleteStage).not.toHaveBeenCalled();
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Sí, quitar' }));

    await waitFor(() => expect(nombres(dialogo)).toEqual(['Nuevo', 'Interesado', 'Oportunidad', 'Cliente']));
    expect(leadsService.deleteStage).toHaveBeenCalledTimes(1);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Listo' }));
    expect(columnas()).toEqual(['Nuevo', 'Interesado', 'Oportunidad', 'Cliente']);
  });

  it('Cancelar no quita nada', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar Contactado' }));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(within(dialogo).queryByRole('group', { name: /confirmar quitar/i })).not.toBeInTheDocument();
    expect(leadsService.deleteStage).not.toHaveBeenCalled();
    expect(nombres(dialogo)).toHaveLength(5);
  });

  it('una etapa con leads no se quita: explica que hay que mover los leads antes y la deja en su lugar', async () => {
    await abrirTablero([MARIA]);
    const dialogo = await abrirEtapas();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar Nuevo' }));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Sí, quitar' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/mueve primero los leads/i);
    expect(nombres(dialogo)).toContain('Nuevo');
    expect(within(dialogo).queryByRole('group', { name: /confirmar quitar/i })).not.toBeInTheDocument();
  });

  it('una etapa que el servidor protege (409) también lo explica', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar Contactado' }));
    vi.mocked(leadsService.deleteStage).mockRejectedValueOnce(new ApiError(409, 'STAGE_PROTECTED', 'Protegida'));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Sí, quitar' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/no se puede mover ni quitar/i);
  });

  it('una etapa que ya no existe (404) pide recargar', async () => {
    await abrirTablero();
    const dialogo = await abrirEtapas();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar Contactado' }));
    vi.mocked(leadsService.deleteStage).mockRejectedValueOnce(new ApiError(404, 'STAGE_NOT_FOUND', 'No existe'));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Sí, quitar' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/recarga/i);
  });
});
