import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/features/auth/sessionStore';
import { GOALS, SAMPLE_FUNNELS, TEMPLATES, WIZARD_STEPS } from '@/features/funnels/catalog';
import { createFakeBackend, stubMockEnv, type FakeBackend } from './helpers/fakeBackend';
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

const continuar = () => userEvent.click(screen.getByRole('button', { name: /continuar/i }));
const atras = () => userEvent.click(screen.getByRole('button', { name: /atrás/i }));
const pasoActual = () => screen.getByRole('listitem', { current: 'step' });

describe('lista de funnels (cáscara)', () => {
  it('el menú lateral lleva a «Funnels» y marca la sección actual', async () => {
    const { router } = montar('/');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    const menu = screen.getAllByRole('navigation', { name: /navegación principal/i })[0]!;
    await userEvent.click(within(menu).getByRole('link', { name: /^funnels$/i }));
    await screen.findByRole('heading', { name: 'Funnels' });
    expect(router.state.location.pathname).toBe('/funnels');
    expect(within(menu).getByRole('link', { name: /^funnels$/i })).toHaveAttribute('aria-current', 'page');
  });

  it('muestra los funnels de ejemplo y avisa que son de ejemplo', async () => {
    montar('/funnels');
    const lista = await screen.findByRole('list', { name: /funnels de ejemplo/i });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(SAMPLE_FUNNELS.length);
    for (const funnel of SAMPLE_FUNNELS) expect(within(lista).getByText(funnel.name)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/datos de ejemplo/i);
    expect(within(lista).getAllByText('Publicado').length + within(lista).getAllByText('Borrador').length).toBe(SAMPLE_FUNNELS.length);
  });

  it('«Nuevo funnel» abre el asistente', async () => {
    const { router } = montar('/funnels');
    await userEvent.click(await screen.findByRole('link', { name: /nuevo funnel/i }));
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    expect(router.state.location.pathname).toBe('/funnels/nuevo');
  });

  it('es una pantalla privada: sin negocio manda a la bienvenida, sin sesión al login', async () => {
    backend.state.workspaces = [];
    const sinNegocio = montar('/funnels');
    await screen.findByRole('heading', { name: /bienvenido a original flow/i });
    expect(sinNegocio.router.state.location.pathname).toBe('/bienvenida');
    sinNegocio.unmount();

    sessionStore.clear();
    const sinSesion = montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /inicia sesión/i });
    expect(sinSesion.router.state.location.pathname).toBe('/login');
  });
});

describe('asistente de creación (cáscara)', () => {
  it('empieza en el paso 1 con el primer objetivo elegido, para poder avanzar sin tocar nada', async () => {
    montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument();
    expect(pasoActual()).toHaveTextContent(WIZARD_STEPS[0].title);
    expect(screen.getAllByRole('radio')).toHaveLength(GOALS.length);
    expect(screen.getByRole('radio', { name: GOALS[0]!.name })).toBeChecked();
    expect(screen.getByRole('button', { name: /atrás/i })).toBeDisabled();
  });

  it('recorre los cuatro pasos hasta el final y vuelve a la lista', async () => {
    const { router } = montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });

    await continuar();
    expect(await screen.findByRole('heading', { name: /producto y tu público/i })).toBeInTheDocument();
    expect(screen.getByText('Paso 2 de 4')).toBeInTheDocument();
    await continuar();
    expect(await screen.findByRole('heading', { name: /elige una plantilla/i })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(TEMPLATES.length);
    await continuar();
    expect(await screen.findByRole('heading', { name: /todo listo/i })).toBeInTheDocument();
    expect(pasoActual()).toHaveTextContent(WIZARD_STEPS[3].title);
    expect(screen.queryByRole('button', { name: /continuar/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /generar funnel/i }));
    await screen.findByRole('heading', { name: 'Funnels' });
    expect(router.state.location.pathname).toBe('/funnels');
  });

  it('«Atrás» regresa al paso anterior y conserva lo elegido', async () => {
    montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    await userEvent.click(screen.getByRole('radio', { name: 'Webinar o evento' }));
    await continuar();
    await userEvent.type(await screen.findByLabelText(/nombre del funnel/i), 'Mi webinar');
    await atras();
    expect(await screen.findByRole('heading', { name: /qué quieres lograr/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Webinar o evento' })).toBeChecked();
    await continuar();
    expect(screen.getByLabelText(/nombre del funnel/i)).toHaveValue('Mi webinar');
  });

  it('elegir otro objetivo o plantilla cambia la selección (una sola a la vez)', async () => {
    montar('/funnels/nuevo');
    await userEvent.click(await screen.findByRole('radio', { name: 'Vender un producto' }));
    expect(screen.getByRole('radio', { name: 'Vender un producto' })).toBeChecked();
    expect(screen.getByRole('radio', { name: GOALS[0]!.name })).not.toBeChecked();
    await continuar();
    await continuar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Agenda' }));
    expect(screen.getByRole('radio', { name: 'Agenda' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Claridad' })).not.toBeChecked();
  });

  it('el resumen refleja lo elegido y lo escrito', async () => {
    montar('/funnels/nuevo');
    await userEvent.click(await screen.findByRole('radio', { name: 'Lead magnet' }));
    await continuar();
    await userEvent.type(await screen.findByLabelText(/nombre del funnel/i), 'Guía de plantillas');
    await userEvent.type(screen.getByLabelText(/qué ofreces/i), 'Un pack de 10 plantillas');
    await userEvent.type(screen.getByLabelText(/a quién va dirigido/i), 'Freelancers');
    await continuar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Recurso' }));
    await continuar();
    await screen.findByRole('heading', { name: /todo listo/i });
    const resumen = screen.getByText('Objetivo', { selector: 'dt' }).closest('dl')!;
    for (const texto of ['Lead magnet', 'Guía de plantillas', 'Un pack de 10 plantillas', 'Freelancers', 'Recurso · Lead magnet']) {
      expect(within(resumen).getByText(texto)).toBeInTheDocument();
    }
  });

  it('lo que no se llenó aparece como «Sin definir» en el resumen, sin errores', async () => {
    montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    await continuar();
    await continuar();
    await continuar();
    expect(await screen.findByText('Sin nombre')).toBeInTheDocument();
    expect(screen.getAllByText('Sin definir')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('el logotipo va arriba a la izquierda, junto al nombre del negocio activo y una «X» para salir', async () => {
    const { router } = montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    const encabezado = screen.getByRole('banner');
    expect(encabezado.firstElementChild).toBe(screen.getByRole('img', { name: 'Original Flow' }));
    expect(within(encabezado).getByText(backend.state.workspaces[0]!.name)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /cerrar el asistente/i }));
    await screen.findByRole('heading', { name: 'Funnels' });
    expect(router.state.location.pathname).toBe('/funnels');
  });

  it('es solo la cáscara: no llama al backend para nada de funnels', async () => {
    montar('/funnels');
    await userEvent.click(await screen.findByRole('link', { name: /nuevo funnel/i }));
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    await continuar();
    await continuar();
    await continuar();
    await userEvent.click(await screen.findByRole('button', { name: /generar funnel/i }));
    await screen.findByRole('heading', { name: 'Funnels' });
    expect(backend.calls.filter((c) => /funnel/i.test(c.path))).toEqual([]);
    expect(backend.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });
});
