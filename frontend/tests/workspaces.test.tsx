import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/features/auth/sessionStore';
import { SUGGESTED_PALETTE } from '@/features/workspaces/brand';
import { createFakeBackend, stubMockEnv, workspaceFixture, type FakeBackend } from './helpers/fakeBackend';
import { montar } from './helpers/renderApp';

let backend: FakeBackend;
beforeEach(() => {
  stubMockEnv();
  backend = createFakeBackend();
  sessionStore.set(backend.seedSession('ana@correo.com', 'Ana'));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const escribir = async (campo: RegExp, texto: string) => {
  const input = screen.getByLabelText(campo);
  await userEvent.clear(input);
  await userEvent.type(input, texto);
};
const patches = () => backend.calls.filter((c) => c.method === 'PATCH');
const posts = () => backend.calls.filter((c) => c.method === 'POST' && c.path === '/workspaces');

/** Bienvenida → «Tu negocio» con solo el nombre → llega al paso de marca. */
async function llegarAMarca(nombre = 'Nimbral') {
  montar('/bienvenida');
  await userEvent.click(await screen.findByRole('button', { name: /empezar/i }));
  await escribir(/nombre del negocio/i, nombre);
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
  await screen.findByRole('heading', { name: /configura tu marca/i });
}

describe('sin negocio: alta del negocio', () => {
  beforeEach(() => {
    backend.state.workspaces = [];
  });

  it('una persona sin negocios que abre la plataforma es enviada a la bienvenida', async () => {
    const { router } = montar('/');
    expect(await screen.findByRole('heading', { name: /bienvenido a original flow/i })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/bienvenida');
  });

  it('también la manda a la bienvenida desde «Mi negocio»', async () => {
    const { router } = montar('/negocio');
    await screen.findByRole('heading', { name: /bienvenido a original flow/i });
    expect(router.state.location.pathname).toBe('/bienvenida');
  });

  it('recorre los tres pasos: crea el negocio, guarda la paleta y entra a la plataforma', async () => {
    const { router } = montar('/');
    await screen.findByRole('heading', { name: /bienvenido/i });
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Bienvenida');

    await userEvent.click(screen.getByRole('button', { name: /empezar/i }));
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Tu negocio');
    await escribir(/nombre del negocio/i, 'Academia Nimbral');
    await escribir(/país/i, 'México');
    await escribir(/sitio web/i, 'https://nimbral.test');
    await userEvent.click(screen.getByRole('radio', { name: /cursos y educación/i }));
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));

    expect(await screen.findByRole('heading', { name: /configura tu marca/i })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Marca');
    expect(posts()[0]?.body).toEqual({ name: 'Academia Nimbral', country: 'México', website: 'https://nimbral.test', industry: 'educacion' });

    await userEvent.click(screen.getByRole('button', { name: /guardar y continuar/i }));
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(router.state.location.pathname).toBe('/');
    expect(patches()).toHaveLength(1);
    expect(patches()[0]?.body).toEqual({ brandPalette: SUGGESTED_PALETTE });
    // El negocio recién creado queda como el activo.
    expect(screen.getByLabelText('Negocio activo')).toHaveDisplayValue('Academia Nimbral');
  });

  it('el nombre es obligatorio: sin él no se llama al backend y se explica el error', async () => {
    montar('/bienvenida');
    await userEvent.click(await screen.findByRole('button', { name: /empezar/i }));
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(await screen.findByText(/escribe el nombre de tu negocio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre del negocio/i)).toBeInvalid();
    expect(posts()).toHaveLength(0);
  });

  it('solo manda los campos que se llenaron (los opcionales vacíos no viajan) y recorta espacios', async () => {
    await llegarAMarca('  Solo nombre  ');
    expect(posts()[0]?.body).toEqual({ name: 'Solo nombre' });
  });

  it('muestra junto a cada campo el error de validación que devuelve el backend y no avanza', async () => {
    montar('/bienvenida');
    await userEvent.click(await screen.findByRole('button', { name: /empezar/i }));
    await escribir(/nombre del negocio/i, 'Nimbral');
    await escribir(/sitio web/i, 'nimbral.test');
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(await screen.findByText(/debe ser una url válida/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sitio web/i)).toBeInvalid();
    expect(screen.getByRole('heading', { name: /cuéntanos sobre tu negocio/i })).toBeInTheDocument();
    expect(backend.state.workspaces).toHaveLength(0);
  });

  it('si no hay conexión al crear el negocio avisa y conserva lo escrito', async () => {
    montar('/bienvenida');
    await userEvent.click(await screen.findByRole('button', { name: /empezar/i }));
    await escribir(/nombre del negocio/i, 'Nimbral');
    backend.state.down = true;
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/conectar/i);
    expect(screen.getByLabelText(/nombre del negocio/i)).toHaveValue('Nimbral');
    backend.state.down = false;
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(await screen.findByRole('heading', { name: /configura tu marca/i })).toBeInTheDocument();
  });

  it('«Atrás» del paso de datos vuelve a la bienvenida', async () => {
    montar('/bienvenida');
    await userEvent.click(await screen.findByRole('button', { name: /empezar/i }));
    await userEvent.click(screen.getByRole('button', { name: /atrás/i }));
    expect(screen.getByRole('heading', { name: /bienvenido/i })).toBeInTheDocument();
  });

  it('«Omitir por ahora» entra a la plataforma sin guardar paleta; el negocio ya existe', async () => {
    await llegarAMarca();
    await userEvent.click(screen.getByRole('button', { name: /omitir por ahora/i }));
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(patches()).toHaveLength(0);
    expect(backend.state.workspaces[0]?.brandPalette).toBeNull();
  });

  it('si falla al guardar la marca avisa, no sale del paso y se puede reintentar', async () => {
    await llegarAMarca();
    backend.state.down = true;
    await userEvent.click(screen.getByRole('button', { name: /guardar y continuar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/conectar/i);
    expect(screen.getByRole('heading', { name: /configura tu marca/i })).toBeInTheDocument();
    backend.state.down = false;
    await userEvent.click(screen.getByRole('button', { name: /guardar y continuar/i }));
    await screen.findByRole('heading', { name: 'Hola, Ana' });
  });

  it('la paleta se edita a mano: el código hexadecimal y el selector de color llegan al backend', async () => {
    await llegarAMarca();
    const primario = screen.getByLabelText('Código de color: Primario');
    await userEvent.clear(primario);
    await userEvent.type(primario, '#ff0000');
    expect(primario).toHaveValue('#FF0000');
    fireEvent.change(screen.getByLabelText('Selector de color: Acento'), { target: { value: '#112233' } });
    expect(screen.getByLabelText('Código de color: Acento')).toHaveValue('#112233');

    await userEvent.click(screen.getByRole('button', { name: /guardar y continuar/i }));
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(patches()[0]?.body).toEqual({ brandPalette: { ...SUGGESTED_PALETTE, primary: '#FF0000', accent: '#112233' } });
  });

  it('un código de color inválido avisa al salir del campo y no cambia la paleta', async () => {
    await llegarAMarca();
    const texto = screen.getByLabelText('Código de color: Texto');
    await userEvent.clear(texto);
    await userEvent.type(texto, '#12');
    expect(screen.queryByText(/usa un color como/i)).not.toBeInTheDocument(); // todavía está escribiendo
    await userEvent.tab();
    expect(await screen.findByText(/usa un color como/i)).toBeInTheDocument();
    expect(texto).toBeInvalid();

    await userEvent.click(screen.getByRole('button', { name: /guardar y continuar/i }));
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(patches()[0]?.body).toEqual({ brandPalette: SUGGESTED_PALETTE });
  });

  it('al salir del campo acepta también la forma corta (#abc) sin reemplazarla mientras se escribe', async () => {
    await llegarAMarca();
    const fondo = screen.getByLabelText('Código de color: Fondo');
    await userEvent.clear(fondo);
    await userEvent.type(fondo, '#abc');
    expect(fondo).toHaveValue('#abc');
    await userEvent.tab();
    expect(fondo).toHaveValue('#AABBCC');
  });

  it('la vista previa usa los colores de la marca del cliente, no los de la plataforma', async () => {
    await llegarAMarca();
    const vista = screen.getByLabelText('Vista previa de la marca');
    expect(within(vista).getByText('Reservar mi lugar')).toHaveStyle({ backgroundColor: SUGGESTED_PALETTE.primary });
    fireEvent.change(screen.getByLabelText('Selector de color: Primario'), { target: { value: '#ff0000' } });
    expect(within(vista).getByText('Reservar mi lugar')).toHaveStyle({ backgroundColor: '#FF0000' });
  });

  it('el logotipo completo va arriba a la izquierda en la bienvenida', async () => {
    montar('/bienvenida');
    await screen.findByRole('heading', { name: /bienvenido/i });
    expect(screen.getByRole('banner').firstElementChild).toBe(screen.getByRole('img', { name: 'Original Flow' }));
  });

  it('desde la bienvenida se puede cerrar la sesión', async () => {
    const { router } = montar('/bienvenida');
    await screen.findByRole('heading', { name: /bienvenido/i });
    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    await screen.findByRole('heading', { name: /inicia sesión/i });
    expect(router.state.location.pathname).toBe('/login');
  });
});

describe('con negocio', () => {
  it('«Nuevo negocio» abre el alta directo en «Tu negocio» y permite cancelar', async () => {
    const { router } = montar('/');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await userEvent.click(screen.getByRole('button', { name: /nuevo negocio/i }));
    expect(await screen.findByRole('heading', { name: /cuéntanos sobre tu negocio/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /bienvenido a original flow/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(router.state.location.pathname).toBe('/');
    expect(posts()).toHaveLength(0);
  });

  it('un segundo negocio se crea, queda activo y aparece en el selector', async () => {
    montar('/bienvenida');
    await screen.findByRole('heading', { name: /cuéntanos sobre tu negocio/i });
    await escribir(/nombre del negocio/i, 'Otra Marca');
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await userEvent.click(await screen.findByRole('button', { name: /omitir por ahora/i }));
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    const selector = screen.getByLabelText('Negocio activo');
    expect(selector).toHaveDisplayValue('Otra Marca');
    expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual(['Academia Nimbral', 'Otra Marca']);
  });

  it('si no se pueden cargar los negocios ofrece reintentar, sin mandar al alta', async () => {
    backend.state.downPaths = ['/workspaces'];
    const { router } = montar('/');
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar tus negocios/i);
    expect(router.state.location.pathname).toBe('/');
    backend.state.downPaths = [];
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
  });
});

describe('selector de negocio activo', () => {
  beforeEach(() => {
    backend.state.workspaces = [workspaceFixture({ id: 'wa', name: 'Academia Nimbral' }), workspaceFixture({ id: 'wb', name: 'Tienda Lumen' })];
  });

  it('por defecto trabaja con el primer negocio', async () => {
    montar('/');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(screen.getByLabelText('Negocio activo')).toHaveDisplayValue('Academia Nimbral');
  });

  it('cambiar de negocio actualiza la pantalla y se recuerda en este navegador', async () => {
    montar('/');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await userEvent.selectOptions(screen.getByLabelText('Negocio activo'), 'Tienda Lumen');
    expect(screen.getByText('Tienda Lumen', { selector: 'strong' })).toBeInTheDocument();
    expect(localStorage.getItem('of-workspace')).toBe('wb');
  });

  it('al volver a abrir recuerda el negocio elegido', async () => {
    localStorage.setItem('of-workspace', 'wb');
    montar('/');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(screen.getByLabelText('Negocio activo')).toHaveDisplayValue('Tienda Lumen');
  });

  it('si el negocio recordado ya no existe vuelve al primero', async () => {
    localStorage.setItem('of-workspace', 'borrado');
    montar('/');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(screen.getByLabelText('Negocio activo')).toHaveDisplayValue('Academia Nimbral');
  });

  it('«Mi negocio» muestra los datos del negocio activo y cambia con el selector', async () => {
    backend.state.workspaces[1]!.country = 'Chile';
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    expect(screen.getByLabelText(/nombre del negocio/i)).toHaveValue('Academia Nimbral');
    await userEvent.selectOptions(screen.getByLabelText('Negocio activo'), 'Tienda Lumen');
    expect(screen.getByLabelText(/nombre del negocio/i)).toHaveValue('Tienda Lumen');
    expect(screen.getByLabelText(/país/i)).toHaveValue('Chile');
  });

  it('el menú lleva a «Mi negocio» y marca la sección actual', async () => {
    const { router } = montar('/');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    const menu = screen.getAllByRole('navigation', { name: /navegación principal/i })[0]!;
    await userEvent.click(within(menu).getByRole('link', { name: /mi negocio/i }));
    await screen.findByRole('heading', { name: 'Mi negocio' });
    expect(router.state.location.pathname).toBe('/negocio');
    expect(within(menu).getByRole('link', { name: /mi negocio/i })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Mi negocio', () => {
  beforeEach(() => {
    backend.state.workspaces = [
      workspaceFixture({ id: 'wa', name: 'Academia Nimbral', country: 'México', website: 'https://nimbral.test', industry: 'educacion', brandPalette: { ...SUGGESTED_PALETTE } }),
    ];
  });

  it('muestra los datos y la paleta guardados', async () => {
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    expect(screen.getByLabelText(/nombre del negocio/i)).toHaveValue('Academia Nimbral');
    expect(screen.getByLabelText(/país/i)).toHaveValue('México');
    expect(screen.getByLabelText(/sitio web/i)).toHaveValue('https://nimbral.test');
    expect(screen.getByRole('radio', { name: /cursos y educación/i })).toBeChecked();
    expect(screen.getByLabelText('Código de color: Primario')).toHaveValue(SUGGESTED_PALETTE.primary);
  });

  it('guardar sin cambiar nada no llama al backend', async () => {
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/cambios guardados/i);
    expect(patches()).toHaveLength(0);
  });

  it('cambiar un solo dato manda solo ese dato', async () => {
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    await escribir(/nombre del negocio/i, 'Nimbral Pro');
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/cambios guardados/i);
    expect(patches()).toHaveLength(1);
    expect(patches()[0]?.path).toBe('/workspaces/wa');
    expect(patches()[0]?.body).toEqual({ name: 'Nimbral Pro' });
    // El selector refleja el nuevo nombre sin recargar.
    expect(screen.getByLabelText('Negocio activo')).toHaveDisplayValue('Nimbral Pro');
  });

  it('vaciar un campo opcional lo borra (se manda null)', async () => {
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    await userEvent.clear(screen.getByLabelText(/sitio web/i));
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await screen.findByRole('status');
    expect(patches()[0]?.body).toEqual({ website: null });
    expect(backend.state.workspaces[0]?.website).toBeNull();
  });

  it('un cambio en la paleta viaja completo junto con los demás cambios', async () => {
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    fireEvent.change(screen.getByLabelText('Selector de color: Fondo'), { target: { value: '#ffffff' } });
    await escribir(/país/i, 'Chile');
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await screen.findByRole('status');
    expect(patches()[0]?.body).toEqual({ country: 'Chile', brandPalette: { ...SUGGESTED_PALETTE, background: '#FFFFFF' } });
  });

  it('un negocio sin paleta no guarda la sugerida si la persona no la toca', async () => {
    backend.state.workspaces = [workspaceFixture({ id: 'wa', name: 'Sin paleta', brandPalette: null })];
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    await escribir(/país/i, 'Perú');
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await screen.findByRole('status');
    expect(patches()[0]?.body).toEqual({ country: 'Perú' });
  });

  it('el nombre no puede quedar vacío', async () => {
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    await userEvent.clear(screen.getByLabelText(/nombre del negocio/i));
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(await screen.findByText(/escribe el nombre de tu negocio/i)).toBeInTheDocument();
    expect(patches()).toHaveLength(0);
  });

  it('muestra el error de validación del backend junto al campo y no marca «guardado»', async () => {
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    await escribir(/sitio web/i, 'sin-protocolo');
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(await screen.findByText(/debe ser una url válida/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sitio web/i)).toBeInvalid();
    expect(screen.queryByText(/cambios guardados/i)).not.toBeInTheDocument();
    expect(backend.state.workspaces[0]?.website).toBe('https://nimbral.test');
  });

  it('quien no administra el negocio lo ve en solo lectura y no puede guardar', async () => {
    backend.state.workspaces = [workspaceFixture({ id: 'wa', name: 'Academia Nimbral', role: 'vendedor', brandPalette: { ...SUGGESTED_PALETTE } })];
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    expect(screen.getByText(/solo el administrador del negocio puede editar/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre del negocio/i)).toBeDisabled();
    expect(screen.getByLabelText('Código de color: Primario')).toBeDisabled();
    expect(screen.getByLabelText('Selector de color: Primario')).toBeDisabled();
    expect(screen.getByRole('radio', { name: /cursos y educación/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /guardar cambios/i })).not.toBeInTheDocument();
  });

  it('un administrador sí puede editar (los permisos salen del rol del negocio activo)', async () => {
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    expect(screen.queryByText(/solo el administrador/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/nombre del negocio/i)).toBeEnabled();
  });
});
