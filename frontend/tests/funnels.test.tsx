import { createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/features/auth/sessionStore';
import { GOALS, TEMPLATES, TONES, WIZARD_STEPS, templateOf } from '@/features/funnels/catalog';
import { ApiError } from '@/services/api';
import * as funnelsService from '@/services/funnels';
import { getFunnel, listFunnels } from '@/services/funnels';
import { SUGGESTED_PALETTE } from '@/features/workspaces/brand';
import { startDemo, seedFunnel } from './helpers/demoApp';
import { montar } from './helpers/renderApp';

vi.mock('@/services/funnels', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/funnels')>();
  return { ...original, saveContent: vi.fn(original.saveContent), createFunnel: vi.fn(original.createFunnel), listFunnels: vi.fn(original.listFunnels) };
});

let ctx: Awaited<ReturnType<typeof startDemo>>;
beforeEach(async () => {
  vi.mocked(funnelsService.saveContent).mockReset();
  vi.mocked(funnelsService.createFunnel).mockReset();
  vi.mocked(funnelsService.listFunnels).mockReset();
  ctx = await startDemo();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const continuar = () => userEvent.click(screen.getByRole('button', { name: /continuar/i }));
const atras = () => userEvent.click(screen.getByRole('button', { name: /atrás/i }));
const pasoActual = () => screen.getByRole('listitem', { current: 'step' });
const escribir = (campo: RegExp, texto: string) => userEvent.type(screen.getByLabelText(campo), texto);

describe('lista de funnels', () => {
  it('el menú lateral lleva a «Funnels» y marca la sección actual', async () => {
    const { router } = montar('/');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    const menu = screen.getAllByRole('navigation', { name: /navegación principal/i })[0]!;
    await userEvent.click(within(menu).getByRole('link', { name: /^funnels$/i }));
    await screen.findByRole('heading', { name: 'Funnels' });
    expect(router.state.location.pathname).toBe('/funnels');
    expect(within(menu).getByRole('link', { name: /^funnels$/i })).toHaveAttribute('aria-current', 'page');
  });

  it('sin funnels invita a crear el primero', async () => {
    const { router } = montar('/funnels');
    expect(await screen.findByRole('heading', { name: /todavía no tienes funnels/i })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /tus funnels/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /crear mi primer funnel/i }));
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    expect(router.state.location.pathname).toBe('/funnels/nuevo');
  });

  it('muestra los funnels del negocio, el más nuevo primero, con su tipo, su estado y su fecha', async () => {
    await seedFunnel(ctx.token, ctx.workspace, { name: 'Primero', objective: 'leads' });
    await new Promise((r) => setTimeout(r, 5));
    await seedFunnel(ctx.token, ctx.workspace, { name: 'Segundo', objective: 'citas' });
    montar('/funnels');
    const lista = await screen.findByRole('list', { name: /tus funnels/i });
    const filas = within(lista).getAllByRole('listitem');
    expect(filas.map((f) => within(f).getByText(/^(Primero|Segundo)$/).textContent)).toEqual(['Segundo', 'Primero']);
    expect(within(filas[0]!).getByText('Agendar reuniones')).toBeInTheDocument();
    expect(within(filas[1]!).getByText('Captar leads')).toBeInTheDocument();
    expect(within(filas[0]!).getByText('Borrador')).toBeInTheDocument();
    expect(within(filas[0]!).getByText(new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date()))).toBeInTheDocument();
  });

  it('cada funnel abre su editor', async () => {
    const funnel = await seedFunnel(ctx.token, ctx.workspace, { name: 'Mi curso' });
    const { router } = montar('/funnels');
    await userEvent.click(await screen.findByRole('link', { name: /mi curso/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/funnels/${funnel.id}/editor`));
  });

  it('solo muestra los funnels del negocio activo', async () => {
    await seedFunnel(ctx.token, ctx.workspace, { name: 'De Academia' });
    const otro = await (await import('@/services/workspaces')).createWorkspace(ctx.token, { name: 'Tienda Lumen' });
    await seedFunnel(ctx.token, otro, { name: 'De Tienda' });
    montar('/funnels');
    await screen.findByText('De Academia');
    expect(screen.queryByText('De Tienda')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Negocio activo'), 'Tienda Lumen');
    expect(await screen.findByText('De Tienda')).toBeInTheDocument();
    expect(screen.queryByText('De Academia')).not.toBeInTheDocument();
  });

  it('si no se pueden cargar avisa y deja reintentar', async () => {
    vi.mocked(listFunnels).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    montar('/funnels');
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar tus funnels/i);
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('heading', { name: /todavía no tienes funnels/i })).toBeInTheDocument();
  });

  it('«Nuevo funnel» abre el asistente', async () => {
    const { router } = montar('/funnels');
    await userEvent.click(await screen.findByRole('link', { name: /nuevo funnel/i }));
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    expect(router.state.location.pathname).toBe('/funnels/nuevo');
  });

  it('es una pantalla privada: sin sesión manda al login', async () => {
    sessionStore.clear();
    const { router } = montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /inicia sesión/i });
    expect(router.state.location.pathname).toBe('/login');
  });
});

describe('asistente de creación', () => {
  it('empieza en el paso 1 con el primer objetivo elegido, para poder avanzar sin tocar nada', async () => {
    montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument();
    expect(pasoActual()).toHaveTextContent(WIZARD_STEPS[0].title);
    expect(screen.getAllByRole('radio')).toHaveLength(GOALS.length);
    expect(screen.getByRole('radio', { name: GOALS[0]!.name })).toBeChecked();
    expect(screen.getByRole('button', { name: /atrás/i })).toBeDisabled();
  });

  it('los objetivos son los tipos del backend; «upsell» y «libre» todavía no se pueden elegir', async () => {
    montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    expect(GOALS.map((g) => g.id)).toEqual(['leads', 'venta', 'citas', 'magnet', 'webinar', 'aplicacion', 'upsell', 'libre']);
    for (const nombre of ['Upsell / downsell', 'Funnel libre']) expect(screen.getByRole('radio', { name: nombre })).toBeDisabled();
    expect(screen.getAllByText('Próximamente')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Vender un producto' })).toBeEnabled();
    await userEvent.click(screen.getByText('Funnel libre'));
    expect(screen.getByRole('radio', { name: GOALS[0]!.name })).toBeChecked();
  });

  it('recorre los cuatro pasos', async () => {
    montar('/funnels/nuevo');
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
    expect(screen.getByRole('button', { name: /generar funnel/i })).toBeInTheDocument();
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

  it('el paso 2 es un formulario con las instrucciones para la IA, organizado en secciones', async () => {
    montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    await continuar();
    const formulario = await screen.findByRole('form', { name: /instrucciones para la ia/i });
    expect(screen.getByText(/instrucciones que usará la ia/i)).toBeInTheDocument();
    for (const seccion of ['Tu producto', 'Tu público', 'Cómo debe sonar tu página']) expect(within(formulario).getByRole('heading', { name: seccion })).toBeInTheDocument();
    for (const campo of [/nombre del funnel/i, /qué ofreces/i, /qué resultado obtiene/i, /precio u oferta/i, /a quién va dirigido/i, /dudas u objeciones/i, /texto del botón principal/i, /instrucciones adicionales/i]) {
      expect(within(formulario).getByLabelText(campo)).toHaveValue('');
    }
    expect(within(formulario).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(TONES.map((t) => t.id));
  });

  it('el tono «Cercano» viene elegido y se puede cambiar (uno solo a la vez)', async () => {
    montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    await continuar();
    expect(await screen.findByRole('radio', { name: 'Cercano' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Profesional' }));
    expect(screen.getByRole('radio', { name: 'Profesional' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Cercano' })).not.toBeChecked();
  });

  it('Enter dentro del formulario no recarga la pantalla ni cambia de paso, y enviarlo se cancela', async () => {
    montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    await continuar();
    await userEvent.type(await screen.findByLabelText(/nombre del funnel/i), 'Mi funnel{Enter}');
    expect(screen.getByLabelText(/nombre del funnel/i)).toHaveValue('Mi funnel');
    expect(screen.getByText('Paso 2 de 4')).toBeInTheDocument();
    const formulario = screen.getByRole('form', { name: /instrucciones para la ia/i });
    const envio = createEvent.submit(formulario);
    fireEvent(formulario, envio);
    expect(envio.defaultPrevented).toBe(true);
  });

  it('el resumen refleja lo elegido y todo lo escrito en el formulario', async () => {
    montar('/funnels/nuevo');
    await userEvent.click(await screen.findByRole('radio', { name: 'Lead magnet' }));
    await continuar();
    await userEvent.type(await screen.findByLabelText(/nombre del funnel/i), 'Guía de plantillas');
    await escribir(/qué ofreces/i, 'Un pack de 10 plantillas');
    await escribir(/qué resultado obtiene/i, 'Ahorra 5 horas a la semana');
    await escribir(/precio u oferta/i, 'Gratis');
    await escribir(/a quién va dirigido/i, 'Freelancers');
    await escribir(/dudas u objeciones/i, 'No tengo tiempo');
    await userEvent.click(screen.getByRole('radio', { name: 'Directo' }));
    await escribir(/texto del botón principal/i, 'Quiero mi guía');
    await escribir(/instrucciones adicionales/i, 'Evita la palabra «barato»');
    await continuar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Recurso' }));
    await continuar();
    await screen.findByRole('heading', { name: /todo listo/i });
    const resumen = screen.getByText('Objetivo', { selector: 'dt' }).closest('dl')!;
    for (const texto of ['Lead magnet', 'Guía de plantillas', 'Un pack de 10 plantillas', 'Ahorra 5 horas a la semana', 'Gratis', 'Freelancers', 'No tengo tiempo', 'Directo', 'Quiero mi guía', 'Evita la palabra «barato»', 'Recurso · Lead magnet']) {
      expect(within(resumen).getByText(texto)).toBeInTheDocument();
    }
    expect(within(resumen).queryByText('Sin definir')).not.toBeInTheDocument();
  });

  it('lo que no se llenó aparece como «Sin definir» en el resumen, sin errores', async () => {
    montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    await continuar();
    await continuar();
    await continuar();
    expect(await screen.findByText('Sin nombre')).toBeInTheDocument();
    expect(screen.getAllByText('Sin definir')).toHaveLength(7);
    expect(screen.getByText('Cercano')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un texto largo con saltos de línea se conserva en el formulario y en el resumen', async () => {
    montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    await continuar();
    await userEvent.type(await screen.findByLabelText(/instrucciones adicionales/i), 'Primera línea{Enter}Segunda línea');
    expect(screen.getByLabelText(/instrucciones adicionales/i)).toHaveValue('Primera línea\nSegunda línea');
    await continuar();
    await continuar();
    expect((await screen.findByText(/Primera línea/)).closest('dd')).toHaveClass('whitespace-pre-line');
  });

  it('el logotipo va arriba a la izquierda, junto al nombre del negocio activo y una «X» para salir', async () => {
    const { router } = montar('/funnels/nuevo');
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    const encabezado = screen.getByRole('banner');
    expect(encabezado.firstElementChild).toBe(screen.getByRole('img', { name: 'Original Flow' }));
    expect(within(encabezado).getByText(ctx.workspace.name)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /cerrar el asistente/i }));
    await screen.findByRole('heading', { name: 'Funnels' });
    expect(router.state.location.pathname).toBe('/funnels');
  });
});

describe('«Generar funnel»: crea el funnel, arma la página con la plantilla y abre el editor', () => {
  async function irAlResumen(objetivo: string, plantilla: string, llenar?: () => Promise<void>) {
    await screen.findByRole('heading', { name: /qué quieres lograr/i });
    await userEvent.click(screen.getByRole('radio', { name: objetivo }));
    await continuar();
    await screen.findByRole('form', { name: /instrucciones para la ia/i });
    await llenar?.();
    await continuar();
    await userEvent.click(await screen.findByRole('radio', { name: plantilla }));
    await continuar();
    await screen.findByRole('heading', { name: /todo listo/i });
  }

  it('crea un borrador con lo escrito, guarda el diseño y los bloques, y abre el editor con la página lista', async () => {
    const { router } = montar('/funnels/nuevo');
    await irAlResumen('Captar leads', 'Impacto', async () => {
      await escribir(/nombre del funnel/i, 'Curso de Excel');
      await escribir(/qué ofreces/i, 'Un curso en línea');
      await escribir(/qué resultado obtiene/i, 'Ahorra 5 horas a la semana');
      await escribir(/a quién va dirigido/i, 'Administrativos');
      await escribir(/texto del botón principal/i, 'Quiero inscribirme');
    });
    await userEvent.click(screen.getByRole('button', { name: /generar funnel/i }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/funnels\/[0-9a-f-]{36}\/editor$/));
    const id = router.state.location.pathname.split('/')[2]!;
    const funnel = await getFunnel(ctx.token, id);
    expect(funnel).toMatchObject({ name: 'Curso de Excel', objective: 'leads', status: 'draft', productName: 'Un curso en línea', targetAudience: 'Administrativos', workspaceId: ctx.workspace.id });
    expect(funnel.designSpec).toEqual({ template: 'impacto', palette: templateOf('impacto').palette });
    expect(funnel.content.blocks.map((b) => b.type)).toEqual(['encabezado', 'beneficios', 'testimonios', 'formulario', 'faq']);
    expect(funnel.content.blocks[0]?.content).toMatchObject({ title: 'Ahorra 5 horas a la semana', subtitle: 'Un curso en línea' });
    expect(funnel.content.blocks[3]?.content).toMatchObject({ submitLabel: 'Quiero inscribirme' });
    // El editor abre con esa página.
    expect(await screen.findByRole('navigation', { name: /bloques de la página/i })).toBeInTheDocument();
    expect(screen.getAllByText('Ahorra 5 horas a la semana').length).toBeGreaterThan(0);
  });

  it('con una marca definida, la página usa la paleta del negocio en lugar de la de la plantilla', async () => {
    sessionStorage.clear();
    localStorage.clear();
    const marca = { primary: '#123456', secondary: '#234567', accent: '#345678', background: '#456789', text: '#56789A' };
    ctx = await startDemo({ email: 'otra@correo.com', workspace: 'Con marca', brandPalette: marca });
    const { router } = montar('/funnels/nuevo');
    await irAlResumen('Captar leads', 'Claridad');
    await userEvent.click(screen.getByRole('button', { name: /generar funnel/i }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/editor$/));
    const funnel = await getFunnel(ctx.token, router.state.location.pathname.split('/')[2]!);
    expect(funnel.designSpec?.palette).toEqual(marca);
    expect(funnel.designSpec?.palette).not.toEqual(SUGGESTED_PALETTE);
  });

  it('un funnel de venta guarda el precio y la divisa escritos', async () => {
    const { router } = montar('/funnels/nuevo');
    await irAlResumen('Vender un producto', 'Claridad', async () => {
      await escribir(/nombre del funnel/i, 'Curso');
      await escribir(/precio u oferta/i, '$1,490 USD');
    });
    await userEvent.click(screen.getByRole('button', { name: /generar funnel/i }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/editor$/));
    const funnel = await getFunnel(ctx.token, router.state.location.pathname.split('/')[2]!);
    expect(funnel).toMatchObject({ objective: 'venta', price: 1490, currency: 'USD' });
    expect(funnel.content.blocks.find((b) => b.type === 'precios')?.content).toMatchObject({ plans: [{ price: 1490 }] });
  });

  it('sin escribir nada igual genera una página completa con textos de ejemplo', async () => {
    const { router } = montar('/funnels/nuevo');
    await irAlResumen('Lead magnet', 'Recurso');
    await userEvent.click(screen.getByRole('button', { name: /generar funnel/i }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/editor$/));
    const funnel = await getFunnel(ctx.token, router.state.location.pathname.split('/')[2]!);
    expect(funnel.name).toBe('Lead magnet');
    expect(funnel.content.blocks.map((b) => b.type)).toEqual(['encabezado', 'imagen', 'formulario']);
  });

  it('mientras genera deshabilita los botones y dice «Generando…»', async () => {
    montar('/funnels/nuevo');
    await irAlResumen('Captar leads', 'Claridad');
    vi.mocked(funnelsService.createFunnel).mockImplementationOnce(() => new Promise(() => undefined)); // no responde nunca
    await userEvent.click(screen.getByRole('button', { name: /generar funnel/i }));
    expect(screen.getByRole('button', { name: /generando/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /atrás/i })).toBeDisabled();
  });

  it('si falla al guardar la página avisa, no crea otro funnel al reintentar y abre el editor', async () => {
    const { router } = montar('/funnels/nuevo');
    await irAlResumen('Captar leads', 'Claridad');
    vi.mocked(funnelsService.saveContent).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor.'));
    await userEvent.click(screen.getByRole('button', { name: /generar funnel/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo conectar/i);
    expect(router.state.location.pathname).toBe('/funnels/nuevo');
    await userEvent.click(screen.getByRole('button', { name: /generar funnel/i }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/editor$/));
    expect(funnelsService.createFunnel).toHaveBeenCalledTimes(1);
    expect(await listFunnels(ctx.token, ctx.workspace.id)).toHaveLength(1);
  });

  it('un error inesperado (que no es de la API) también se avisa con un mensaje claro', async () => {
    montar('/funnels/nuevo');
    await irAlResumen('Captar leads', 'Claridad');
    vi.mocked(funnelsService.createFunnel).mockRejectedValueOnce(new Error('boom'));
    await userEvent.click(screen.getByRole('button', { name: /generar funnel/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo generar tu funnel/i);
  });

  it('después de generar, el funnel aparece en la lista', async () => {
    const { router } = montar('/funnels/nuevo');
    await irAlResumen('Captar leads', 'Claridad', () => escribir(/nombre del funnel/i, 'Mi nuevo funnel'));
    await userEvent.click(screen.getByRole('button', { name: /generar funnel/i }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/editor$/));
    await router.navigate('/funnels');
    expect(await screen.findByText('Mi nuevo funnel')).toBeInTheDocument();
  });
});
