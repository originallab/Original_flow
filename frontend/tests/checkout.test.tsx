import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api';
import * as publicService from '@/services/publicPages';
import { navigation } from '@/shared/utils/navigation';
import { editarBaseDeDemostracion, leerBaseDeDemostracion } from './helpers/publicApp';
import { ENLACE_DE_COMPRA, MENSAJE_DE_COMPRA, pagar, tienda } from './helpers/tiendaApp';
import { montar } from './helpers/renderApp';

const tiempos = vi.hoisted(() => ({ poll: 25, max: 3, redirect: 40 }));
vi.mock('@/features/publicPage/checkoutConstants', () => ({
  get ORDER_POLL_MS() {
    return tiempos.poll;
  },
  get MAX_ORDER_POLLS() {
    return tiempos.max;
  },
}));
vi.mock('@/features/publicPage/constants', () => ({
  TRACK_DELAY_MS: 60_000,
  MAX_BATCH: 20,
  get REDIRECT_DELAY_MS() {
    return tiempos.redirect;
  },
}));
vi.mock('@/services/publicPages', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/publicPages')>();
  return { ...original, startCheckout: vi.fn(original.startCheckout), getOrder: vi.fn(original.getOrder), getPublicPage: vi.fn(original.getPublicPage) };
});

beforeEach(() => {
  tiempos.poll = 25;
  tiempos.max = 3;
  tiempos.redirect = 40;
  for (const fn of [publicService.startCheckout, publicService.getOrder, publicService.getPublicPage]) vi.mocked(fn).mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
  Object.defineProperty(document, 'referrer', { value: '', configurable: true });
});

const dialogo = () => screen.getByRole('dialog', { name: 'Completa tu compra' });
const formulario = () => within(dialogo()).getByRole('form', { name: 'Datos de la compra' });
const campo = (etiqueta: string) => within(formulario()).getByLabelText(etiqueta, { exact: false });

async function abrir(opciones: Parameters<typeof tienda>[0] = {}, busqueda = '') {
  const base = await tienda({ sinSesion: true, ...opciones });
  const vista = montar(`/p/${base.slug}${busqueda}`);
  await screen.findByRole('article', { name: 'Página' });
  await waitFor(() => expect(document.documentElement.lang).not.toBe(''));
  return { ...base, ...vista };
}
const comprar = () => userEvent.click(screen.getByRole('button', { name: 'Comprar ahora' }));
async function llenar({ nombre = 'María Pérez', correo = 'maria@correo.com', acepto = true }: { nombre?: string; correo?: string; acepto?: boolean } = {}) {
  await userEvent.clear(campo('Nombre'));
  await userEvent.clear(campo('Correo'));
  if (nombre) await userEvent.type(campo('Nombre'), nombre);
  if (correo) await userEvent.type(campo('Correo'), correo);
  const casilla = within(formulario()).getByRole('checkbox', { name: /acepto/i });
  if (acepto !== (casilla as HTMLInputElement).checked) await userEvent.click(casilla);
}
const pagarAhora = () => userEvent.click(within(formulario()).getByRole('button', { name: /^Pagar/ }));
const irAPagar = () => vi.spyOn(navigation, 'to').mockImplementation(() => undefined);
const claveUsada = (n = 0) => vi.mocked(publicService.startCheckout).mock.calls[n]![2];

describe('abrir la compra', () => {
  it('el botón de pago abre la compra con el producto y su precio, sin el logotipo de la plataforma', async () => {
    await abrir();
    await comprar();
    expect(dialogo()).toHaveTextContent('Curso en línea');
    expect(dialogo()).toHaveTextContent(/500/);
    expect(within(formulario()).getByRole('button', { name: /^Pagar.*500/ })).toBeEnabled();
    expect(screen.queryByRole('img', { name: 'Original Flow' })).not.toBeInTheDocument();
  });

  it('el foco empieza en el nombre y vuelve al botón al cerrar; se cierra con Escape, con la X y con un clic afuera', async () => {
    await abrir();
    await comprar();
    expect(campo('Nombre')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comprar ahora' })).toHaveFocus();
    await comprar();
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await comprar();
    fireEvent.mouseDown(dialogo().parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mantiene el teclado dentro de la compra (Tab y Shift+Tab dan la vuelta)', async () => {
    await abrir();
    await comprar();
    const pagarBoton = within(formulario()).getByRole('button', { name: /^Pagar/ });
    pagarBoton.focus();
    await userEvent.tab();
    expect(within(dialogo()).getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(pagarBoton).toHaveFocus();
  });

  it('un producto sin precio no se puede comprar', async () => {
    const { slug } = await tienda({ sinSesion: true });
    editarBaseDeDemostracion((db) => {
      db.funnels[0].price = null;
    });
    montar(`/p/${slug}`);
    const boton = await screen.findByRole('button', { name: 'Comprar ahora' });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('title', 'Este producto todavía no tiene precio');
  });

  it('mide el clic en el botón de pago', async () => {
    await abrir();
    await comprar();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(leerBaseDeDemostracion().events.some((e) => e.type === 'button_click' && e.properties.blockKey === 'boton')).toBe(true));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
});

describe('el formulario de la compra', () => {
  it('sin llenarlo marca lo obligatorio y el consentimiento, y no manda nada', async () => {
    await abrir();
    await comprar();
    await pagarAhora();
    expect(within(formulario()).getByText('Escribe tu nombre (hasta 200 caracteres).')).toBeInTheDocument();
    expect(within(formulario()).getByText('Escribe un correo válido.')).toBeInTheDocument();
    expect(within(formulario()).getByText(/debes aceptar el tratamiento de tus datos/i)).toBeInTheDocument();
    expect(campo('Nombre')).toBeInvalid();
    expect(publicService.startCheckout).not.toHaveBeenCalled();
  });

  it('un correo o un teléfono mal escritos se marcan en su campo', async () => {
    await abrir();
    await comprar();
    await llenar({ correo: 'maria@' });
    await userEvent.type(campo('Teléfono'), 'abc');
    await pagarAhora();
    expect(within(formulario()).getByText('Escribe un correo válido.')).toBeInTheDocument();
    expect(within(formulario()).getByText('Escribe un teléfono válido.')).toBeInTheDocument();
    expect(publicService.startCheckout).not.toHaveBeenCalled();
  });

  it('escribir en un campo quita su aviso', async () => {
    await abrir();
    await comprar();
    await pagarAhora();
    await userEvent.type(campo('Nombre'), 'M');
    expect(campo('Nombre')).toBeValid();
    await userEvent.click(within(formulario()).getByRole('checkbox', { name: /acepto/i }));
    expect(within(formulario()).queryByText(/debes aceptar/i)).not.toBeInTheDocument();
  });

  it('manda los datos con una clave de idempotencia, los UTM y el consentimiento, y lleva a la persona a pagar', async () => {
    const ir = irAPagar();
    Object.defineProperty(document, 'referrer', { value: 'https://instagram.com/mi-cuenta', configurable: true });
    const { slug } = await abrir({}, '?utm_source=instagram&utm_campaign=octubre');
    await comprar();
    await llenar();
    await userEvent.type(campo('Teléfono'), '55 1234 5678');
    await pagarAhora();
    await waitFor(() => expect(ir).toHaveBeenCalledTimes(1));
    const [, cuerpo, clave] = vi.mocked(publicService.startCheckout).mock.calls[0]!;
    expect(vi.mocked(publicService.startCheckout).mock.calls[0]![0]).toBe(slug);
    expect(cuerpo).toEqual({ name: 'María Pérez', email: 'maria@correo.com', phone: '55 1234 5678', paymentMethod: 'stripe', consent: true, utm: { utm_source: 'instagram', utm_campaign: 'octubre', referrer: 'https://instagram.com/mi-cuenta' } });
    expect(clave.length).toBeGreaterThanOrEqual(8);
    expect(clave.length).toBeLessThanOrEqual(64);
    expect(cuerpo).not.toHaveProperty('amount');
    expect(ir.mock.calls[0]![0]).toMatch(/\/demo\/pago\/[0-9a-f-]{36}$/);
    expect(leerBaseDeDemostracion().orders[0]).toMatchObject({ amount: 500, customerEmail: 'maria@correo.com', paymentMethod: 'stripe' });
  });

  it('el teléfono es opcional: sin él no se manda', async () => {
    irAPagar();
    await abrir();
    await comprar();
    await llenar();
    await pagarAhora();
    await waitFor(() => expect(publicService.startCheckout).toHaveBeenCalled());
    expect(vi.mocked(publicService.startCheckout).mock.calls[0]![1]).not.toHaveProperty('phone');
  });

  it('con varias formas de pago deja elegir (la primera viene marcada) y manda la elegida', async () => {
    irAPagar();
    await abrir();
    await comprar();
    const grupo = within(formulario()).getByRole('group', { name: 'Forma de pago' });
    expect(within(grupo).getAllByRole('radio').map((r) => r.parentElement!.textContent)).toEqual(['Tarjeta de crédito o débito', 'Mercado Pago']);
    expect(within(grupo).getByRole('radio', { name: 'Tarjeta de crédito o débito' })).toBeChecked();
    await userEvent.click(within(grupo).getByRole('radio', { name: 'Mercado Pago' }));
    await llenar();
    await pagarAhora();
    await waitFor(() => expect(publicService.startCheckout).toHaveBeenCalled());
    expect(vi.mocked(publicService.startCheckout).mock.calls[0]![1]).toMatchObject({ paymentMethod: 'mercadopago' });
  });

  it('con una sola forma de pago no pregunta, pero la manda', async () => {
    irAPagar();
    await abrir({ metodos: ['webpay'] });
    await comprar();
    expect(within(formulario()).queryByRole('group', { name: 'Forma de pago' })).not.toBeInTheDocument();
    await llenar();
    await pagarAhora();
    await waitFor(() => expect(publicService.startCheckout).toHaveBeenCalled());
    expect(vi.mocked(publicService.startCheckout).mock.calls[0]![1]).toMatchObject({ paymentMethod: 'webpay' });
  });

  it('mientras lleva a pagar el botón dice «Te llevamos a pagar…» y un segundo envío no crea otra compra', async () => {
    irAPagar();
    await abrir();
    await comprar();
    await llenar();
    vi.mocked(publicService.startCheckout).mockImplementationOnce(() => new Promise(() => undefined));
    await pagarAhora();
    const boton = await within(formulario()).findByRole('button', { name: 'Te llevamos a pagar…' });
    expect(boton).toBeDisabled();
    fireEvent.submit(formulario());
    expect(publicService.startCheckout).toHaveBeenCalledTimes(1);
    // Ocupada, la compra no se cierra.
    fireEvent.keyDown(dialogo(), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialogo()).getByRole('button', { name: 'Cerrar' })).toBeDisabled();
  });
});

describe('cuando algo falla', () => {
  async function conFallo(error: ApiError, ...despues: ApiError[]) {
    irAPagar();
    await abrir();
    await comprar();
    await llenar();
    vi.mocked(publicService.startCheckout).mockRejectedValueOnce(error);
    for (const siguiente of despues) vi.mocked(publicService.startCheckout).mockRejectedValueOnce(siguiente);
    await pagarAhora();
    return within(formulario()).findByRole('alert');
  }

  it.each([
    [new ApiError(503, 'ORIGIN_PAY_UNAVAILABLE', 'No responde'), /el pago no está disponible en este momento/i],
    [new ApiError(429, 'RATE_LIMITED', 'Muchas'), /demasiados intentos/i],
    [new ApiError(404, 'PAGE_NOT_FOUND', 'No existe'), /ya no está disponible/i],
    [new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'), /no se pudo iniciar el pago/i],
    [new ApiError(409, 'ORDER_ALREADY_PAID', 'Pagada'), /ya compraste esto/i],
    [new ApiError(422, 'PRICE_MISSING', 'Sin precio'), /no está disponible por ahora/i],
  ])('un error (%o) se explica y la compra queda para reintentar con lo escrito', async (error, mensaje) => {
    expect(await conFallo(error)).toHaveTextContent(mensaje);
    expect(campo('Nombre')).toHaveValue('María Pérez');
    expect(within(formulario()).getByRole('button', { name: /^Pagar/ })).toBeEnabled();
  });

  it('un problema de validación del servidor se muestra junto a su campo', async () => {
    irAPagar();
    await abrir();
    await comprar();
    await llenar();
    vi.mocked(publicService.startCheckout).mockRejectedValueOnce(new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'email', message: 'El servidor no acepta ese correo' }], 'r'));
    await pagarAhora();
    expect(await within(formulario()).findByText('El servidor no acepta ese correo')).toBeInTheDocument();
    expect(campo('Correo')).toBeInvalid();
  });

  it('el reintento con los mismos datos usa la misma clave, para no cobrar dos veces', async () => {
    const ir = irAPagar();
    await abrir();
    await comprar();
    await llenar();
    vi.mocked(publicService.startCheckout).mockRejectedValueOnce(new ApiError(503, 'ORIGIN_PAY_UNAVAILABLE', 'No responde'));
    await pagarAhora();
    await within(formulario()).findByRole('alert');
    await pagarAhora();
    await waitFor(() => expect(ir).toHaveBeenCalled());
    expect(claveUsada(1)).toBe(claveUsada(0));
    expect(leerBaseDeDemostracion().orders).toHaveLength(1);
  });

  it('con otro correo es otra compra: clave nueva', async () => {
    irAPagar();
    await abrir();
    await comprar();
    await llenar();
    vi.mocked(publicService.startCheckout).mockRejectedValueOnce(new ApiError(503, 'ORIGIN_PAY_UNAVAILABLE', 'No responde'));
    await pagarAhora();
    await within(formulario()).findByRole('alert');
    await userEvent.clear(campo('Correo'));
    await userEvent.type(campo('Correo'), 'otra@correo.com');
    await pagarAhora();
    await waitFor(() => expect(publicService.startCheckout).toHaveBeenCalledTimes(2));
    expect(claveUsada(1)).not.toBe(claveUsada(0));
  });

  it('si el servidor dice que la clave se usó con otros datos, la siguiente vez estrena una', async () => {
    irAPagar();
    await abrir();
    await comprar();
    await llenar();
    vi.mocked(publicService.startCheckout).mockRejectedValueOnce(new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'Otra'));
    await pagarAhora();
    expect(await within(formulario()).findByRole('alert')).toHaveTextContent(/revisa tus datos/i);
    await pagarAhora();
    await waitFor(() => expect(publicService.startCheckout).toHaveBeenCalledTimes(2));
    expect(claveUsada(1)).not.toBe(claveUsada(0));
  });

  it('un enlace de pago que no es http o https nunca se abre', async () => {
    const ir = irAPagar();
    await abrir();
    await comprar();
    await llenar();
    vi.mocked(publicService.startCheckout).mockResolvedValueOnce({ publicToken: 'x', status: 'pending', paymentUrl: 'javascript:alert(1)' });
    await pagarAhora();
    expect(await within(formulario()).findByRole('alert')).toHaveTextContent(/no se pudo iniciar el pago/i);
    expect(ir).not.toHaveBeenCalled();
  });
});

describe('la página a la que vuelve quien pagó', () => {
  async function conOrden(opciones: Parameters<typeof tienda>[0] = {}) {
    const base = await tienda({ sinSesion: true, ...opciones });
    const orden = await publicService.startCheckout(base.slug, { name: 'María Pérez', email: 'maria@correo.com', consent: true }, 'clave-de-compra-0001');
    return { ...base, orden };
  }
  const abrirOrden = (slug: string, token: string) => montar(`/p/${slug}/orden/${token}`);

  it('pendiente: lo dice y se actualiza sola cuando se confirma el pago, con el mensaje y el enlace de la compra', async () => {
    const ir = irAPagar();
    const { slug, orden } = await conOrden();
    abrirOrden(slug, orden.publicToken);
    expect(await screen.findByRole('heading', { name: 'Estamos confirmando tu pago…' })).toBeInTheDocument();
    expect(screen.getByText('No cierres esta página: se actualiza sola.')).toBeInTheDocument();
    await pagar(orden.publicToken, 'paid');
    expect(await screen.findByRole('heading', { name: '¡Pago recibido!' })).toBeInTheDocument();
    expect(screen.getByText(MENSAJE_DE_COMPRA)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuar ahora' })).toHaveAttribute('href', ENLACE_DE_COMPRA);
    await waitFor(() => expect(ir).toHaveBeenCalledWith(ENLACE_DE_COMPRA));
    expect(screen.queryByRole('img', { name: 'Original Flow' })).not.toBeInTheDocument();
  });

  it('un enlace de después de comprar que no es http o https no se abre ni se ofrece', async () => {
    const ir = irAPagar();
    const { slug, orden } = await conOrden();
    editarBaseDeDemostracion((db) => {
      db.funnels[0].typeConfig.successUrl = 'javascript:alert(1)';
    });
    await pagar(orden.publicToken, 'paid');
    abrirOrden(slug, orden.publicToken);
    await screen.findByRole('heading', { name: '¡Pago recibido!' });
    await new Promise((r) => setTimeout(r, 120));
    expect(screen.queryByRole('link', { name: 'Continuar ahora' })).not.toBeInTheDocument();
    expect(ir).not.toHaveBeenCalled();
  });

  it('el pago que no se completó lo dice y deja volver a intentar', async () => {
    const { slug, orden } = await conOrden();
    await pagar(orden.publicToken, 'failed');
    abrirOrden(slug, orden.publicToken);
    expect(await screen.findByRole('heading', { name: 'El pago no se completó' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a intentar' })).toHaveAttribute('href', `/p/${slug}`);
  });

  it('deja de preguntar después de cierto número de veces y ofrece revisar a mano', async () => {
    const { slug, orden } = await conOrden();
    abrirOrden(slug, orden.publicToken);
    await screen.findByRole('heading', { name: 'Estamos confirmando tu pago…' });
    await screen.findByText(/todavía no se confirma/i, undefined, { timeout: 3000 });
    const llamadas = vi.mocked(publicService.getOrder).mock.calls.length;
    expect(llamadas).toBe(1 + tiempos.max);
    await new Promise((r) => setTimeout(r, 120));
    expect(vi.mocked(publicService.getOrder).mock.calls.length).toBe(llamadas);
    await pagar(orden.publicToken, 'paid');
    await userEvent.click(screen.getByRole('button', { name: 'Revisar de nuevo' }));
    expect(await screen.findByRole('heading', { name: '¡Pago recibido!' })).toBeInTheDocument();
  });

  it('una compra que no existe, o de una página que no existe, dice que no la encuentra', async () => {
    const { slug } = await tienda({ sinSesion: true });
    abrirOrden(slug, 'no-existe');
    expect(await screen.findByRole('heading', { name: 'No encontramos esta compra' })).toBeInTheDocument();
  });

  it('si no se puede cargar avisa y deja reintentar', async () => {
    const { slug, orden } = await conOrden();
    vi.mocked(publicService.getOrder).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    abrirOrden(slug, orden.publicToken);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar tu compra.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Estamos confirmando tu pago…' })).toBeInTheDocument();
  });

  it('el título de la pestaña es el del funnel', async () => {
    const { slug, orden } = await conOrden();
    abrirOrden(slug, orden.publicToken);
    await screen.findByRole('heading', { name: 'Estamos confirmando tu pago…' });
    await waitFor(() => expect(document.title).toBe('Curso en línea'));
  });
});

describe('recorrido completo con la pasarela de mentira', () => {
  it('comprar → pagar → ver el resultado', async () => {
    const ir = irAPagar();
    const { router, slug } = await abrir();
    await comprar();
    await llenar();
    await pagarAhora();
    await waitFor(() => expect(ir).toHaveBeenCalled());
    const ruta = new URL(ir.mock.calls[0]![0]).pathname;
    await router.navigate(ruta);
    expect(await screen.findByText('Pasarela de pago de demostración')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Curso en línea' })).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));
    expect(await screen.findByRole('heading', { name: '¡Pago recibido!' })).toBeInTheDocument();
    expect(router.state.location.pathname).toMatch(new RegExp(`^/p/${slug}/orden/`));
    expect(leerBaseDeDemostracion().orders[0]!.status).toBe('paid');
  });

  it('un pago fallido lleva a la pantalla de «no se completó»', async () => {
    const ir = irAPagar();
    const { router } = await abrir();
    await comprar();
    await llenar();
    await pagarAhora();
    await waitFor(() => expect(ir).toHaveBeenCalled());
    await router.navigate(new URL(ir.mock.calls[0]![0]).pathname);
    await userEvent.click(await screen.findByRole('button', { name: 'Simular un pago fallido' }));
    expect(await screen.findByRole('heading', { name: 'El pago no se completó' })).toBeInTheDocument();
  });

  it('una compra que no existe en la pasarela lo dice', async () => {
    await tienda({ sinSesion: true });
    montar('/demo/pago/no-existe');
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos esta compra.');
  });

  it('fuera del modo demostración la pasarela no existe', async () => {
    await tienda({ sinSesion: true });
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    montar('/demo/pago/cualquiera');
    expect(await screen.findByRole('heading', { name: 'Esta página no existe' })).toBeInTheDocument();
    expect(screen.queryByText('Pasarela de pago de demostración')).not.toBeInTheDocument();
  });
});
