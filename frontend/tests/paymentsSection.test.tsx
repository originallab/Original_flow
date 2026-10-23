import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api';
import * as paymentsService from '@/services/payments';
import { startDemo } from './helpers/demoApp';
import { editarBaseDeDemostracion, leerBaseDeDemostracion } from './helpers/publicApp';
import { montar } from './helpers/renderApp';

vi.mock('@/services/payments', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/payments')>();
  return { ...original, getPaymentsStatus: vi.fn(original.getPaymentsStatus), connectPayments: vi.fn(original.connectPayments) };
});

beforeEach(() => {
  for (const fn of [paymentsService.getPaymentsStatus, paymentsService.connectPayments]) vi.mocked(fn).mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const seccion = () => screen.getByRole('region', { name: 'Pagos' });
const formulario = () => within(seccion()).getByRole('form', { name: 'Conectar Original Pay' });
const LLAVE = 'sk_test_12345678';

async function abrir(rol?: string) {
  const base = await startDemo();
  if (rol) {
    editarBaseDeDemostracion((db) => {
      db.workspaces[0].role = rol;
    });
  }
  montar('/negocio');
  await screen.findByRole('heading', { level: 1, name: 'Mi negocio' });
  return base;
}
async function abrirFormulario() {
  await abrir();
  await userEvent.click(await within(await screen.findByRole('region', { name: 'Pagos' })).findByRole('button', { name: 'Conectar Original Pay' }));
}
const conectar = () => userEvent.click(within(formulario()).getByRole('button', { name: 'Conectar' }));
const llave = () => within(formulario()).getByLabelText('Llave de Original Pay');
const metodo = (nombre: string) => within(formulario()).getByRole('checkbox', { name: nombre });

describe('quién ve la sección de pagos', () => {
  it.each(['super_admin', 'client_admin'])('el rol %s la ve, con «todavía no has conectado»', async (rol) => {
    await abrir(rol);
    expect(await within(await screen.findByRole('region', { name: 'Pagos' })).findByText('Todavía no has conectado Original Pay.')).toBeInTheDocument();
  });

  it.each(['marketing_manager', 'disenador', 'vendedor', 'analista'])('el rol %s no la ve y no se pide el estado de los pagos', async (rol) => {
    await abrir(rol);
    expect(screen.queryByRole('region', { name: 'Pagos' })).not.toBeInTheDocument();
    expect(paymentsService.getPaymentsStatus).not.toHaveBeenCalled();
  });

  it('si no se puede cargar avisa y deja reintentar', async () => {
    await startDemo();
    vi.mocked(paymentsService.getPaymentsStatus).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    montar('/negocio');
    expect(await within(await screen.findByRole('region', { name: 'Pagos' })).findByRole('alert')).toHaveTextContent('No se pudo cargar el estado de los pagos.');
    await userEvent.click(within(seccion()).getByRole('button', { name: 'Reintentar' }));
    expect(await within(seccion()).findByText('Todavía no has conectado Original Pay.')).toBeInTheDocument();
  });
});

describe('conectar Original Pay', () => {
  it('la llave se escribe oculta y se explica que se guarda cifrada y no se vuelve a mostrar', async () => {
    await abrirFormulario();
    expect(llave()).toHaveAttribute('type', 'password');
    expect(llave()).toHaveAttribute('autocomplete', 'off');
    expect(within(formulario()).getByText('Se guarda cifrada y no se vuelve a mostrar.')).toBeInTheDocument();
    expect(within(formulario()).getByLabelText('Divisa')).toHaveDisplayValue('MXN');
    expect(within(formulario()).getAllByRole('checkbox').map((c) => c.parentElement!.textContent)).toEqual(['Tarjeta de crédito o débito', 'PayPal', 'Mercado Pago', 'Transferencia SPEI', 'Webpay']);
  });

  it('conecta con la llave, la divisa y las formas elegidas, y luego muestra solo el estado (nunca la llave)', async () => {
    await abrirFormulario();
    await userEvent.type(llave(), LLAVE);
    await userEvent.selectOptions(within(formulario()).getByLabelText('Divisa'), 'USD');
    await userEvent.click(metodo('Mercado Pago'));
    await userEvent.click(metodo('PayPal'));
    await conectar();
    expect(await within(seccion()).findByText('Conectado')).toBeInTheDocument();
    expect(vi.mocked(paymentsService.connectPayments).mock.calls[0]![2]).toEqual({ apiKey: LLAVE, currency: 'USD', methods: ['mercadopago', 'paypal'] });
    expect(within(seccion()).getByText('Original Pay · USD')).toBeInTheDocument();
    expect(within(within(seccion()).getByRole('list', { name: 'Formas de pago' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Mercado Pago', 'PayPal']);
    expect(within(seccion()).getByRole('status')).toHaveTextContent('Original Pay conectado.');
    expect(screen.queryByLabelText('Llave de Original Pay')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(LLAVE);
    expect(JSON.stringify(leerBaseDeDemostracion())).not.toContain(LLAVE);
  });

  it('una llave corta o vacía, sin formas de pago, se marca y no se manda', async () => {
    await abrirFormulario();
    await conectar();
    expect(within(formulario()).getByText('La llave debe tener entre 8 y 500 caracteres.')).toBeInTheDocument();
    expect(within(formulario()).getByText('Elige al menos una forma de pago.')).toBeInTheDocument();
    expect(llave()).toBeInvalid();
    await userEvent.type(llave(), 'corta');
    await userEvent.click(metodo('Webpay'));
    await conectar();
    expect(within(formulario()).getByText('La llave debe tener entre 8 y 500 caracteres.')).toBeInTheDocument();
    expect(paymentsService.connectPayments).not.toHaveBeenCalled();
  });

  it('escribir o elegir de nuevo quita el aviso', async () => {
    await abrirFormulario();
    await conectar();
    await userEvent.type(llave(), 'x');
    expect(within(formulario()).queryByText('La llave debe tener entre 8 y 500 caracteres.')).not.toBeInTheDocument();
    await userEvent.click(metodo('Webpay'));
    expect(within(formulario()).queryByText('Elige al menos una forma de pago.')).not.toBeInTheDocument();
  });

  it('un error de validación del servidor se muestra junto a su campo y cualquier otro se explica', async () => {
    await abrirFormulario();
    await userEvent.type(llave(), LLAVE);
    await userEvent.click(metodo('Webpay'));
    vi.mocked(paymentsService.connectPayments).mockRejectedValueOnce(new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'apiKey', message: 'Esa llave no es válida' }], 'r'));
    await conectar();
    expect(await within(formulario()).findByText('Esa llave no es válida')).toBeInTheDocument();
    vi.mocked(paymentsService.connectPayments).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    await conectar();
    expect(await within(formulario()).findByRole('alert')).toHaveTextContent('No se pudo conectar Original Pay. Inténtalo de nuevo.');
    expect(llave()).toHaveValue(LLAVE);
    await conectar();
    expect(await within(seccion()).findByText('Conectado')).toBeInTheDocument();
  });

  it('mientras conecta el botón dice «Conectando…» y no se manda dos veces', async () => {
    await abrirFormulario();
    await userEvent.type(llave(), LLAVE);
    await userEvent.click(metodo('Webpay'));
    vi.mocked(paymentsService.connectPayments).mockImplementationOnce(() => new Promise(() => undefined));
    await conectar();
    const boton = await within(formulario()).findByRole('button', { name: 'Conectando…' });
    expect(boton).toBeDisabled();
    fireEvent.submit(formulario());
    expect(paymentsService.connectPayments).toHaveBeenCalledTimes(1);
  });

  it('«Cancelar» vuelve al estado sin conectar nada', async () => {
    await abrirFormulario();
    await userEvent.click(within(formulario()).getByRole('button', { name: 'Cancelar' }));
    expect(within(seccion()).getByText('Todavía no has conectado Original Pay.')).toBeInTheDocument();
    expect(paymentsService.connectPayments).not.toHaveBeenCalled();
  });
});

describe('cambiar la conexión', () => {
  async function conectado() {
    await abrirFormulario();
    await userEvent.type(llave(), LLAVE);
    await userEvent.selectOptions(within(formulario()).getByLabelText('Divisa'), 'CLP');
    await userEvent.click(metodo('Webpay'));
    await conectar();
    await within(seccion()).findByText('Conectado');
  }

  it('el formulario trae la divisa y las formas de pago de ahora, pero nunca la llave', async () => {
    await conectado();
    await userEvent.click(within(seccion()).getByRole('button', { name: 'Cambiar la conexión' }));
    expect(llave()).toHaveValue('');
    expect(within(formulario()).getByLabelText('Divisa')).toHaveDisplayValue('CLP');
    expect(metodo('Webpay')).toBeChecked();
    expect(metodo('PayPal')).not.toBeChecked();
    expect(within(seccion()).queryByText('Original Pay conectado.')).not.toBeInTheDocument();
  });

  it('cambiarla pide la llave otra vez y guarda lo nuevo', async () => {
    await conectado();
    await userEvent.click(within(seccion()).getByRole('button', { name: 'Cambiar la conexión' }));
    await conectar();
    expect(within(formulario()).getByText('La llave debe tener entre 8 y 500 caracteres.')).toBeInTheDocument();
    await userEvent.type(llave(), 'otra-llave-1234');
    await userEvent.click(metodo('Webpay'));
    await userEvent.click(metodo('Mercado Pago'));
    await conectar();
    await waitFor(() => expect(within(seccion()).getByRole('list', { name: 'Formas de pago' })).toHaveTextContent('Mercado Pago'));
    expect(vi.mocked(paymentsService.connectPayments).mock.calls[1]![2]).toEqual({ apiKey: 'otra-llave-1234', currency: 'CLP', methods: ['mercadopago'] });
  });

  it('al volver a abrir «Mi negocio» sigue conectado', async () => {
    await conectado();
    montar('/negocio');
    expect(await screen.findAllByText('Original Pay · CLP')).not.toHaveLength(0);
  });
});
