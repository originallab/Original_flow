import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api';
import { createSession, mockCallback } from '@/services/auth';
import * as funnelsService from '@/services/funnels';
import { createFunnel, getFunnel, type Funnel } from '@/services/funnels';
import { createWorkspace } from '@/services/workspaces';
import { BLOCKS } from '@/shared/blocks/catalog';
import { BLOCK_TYPES, type Block } from '@/shared/blocks/types';
import { block, seedFunnel, startDemo } from './helpers/demoApp';
import { montar } from './helpers/renderApp';

// El autoguardado espera poco; una prueba lo alarga para comprobar el guardado al salir de la pantalla.
const retraso = vi.hoisted(() => ({ ms: 25 }));
vi.mock('@/features/editor/constants', () => ({
  get AUTOSAVE_DELAY_MS() {
    return retraso.ms;
  },
}));
vi.mock('@/services/funnels', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/funnels')>();
  return { ...original, saveContent: vi.fn(original.saveContent), getFunnel: vi.fn(original.getFunnel) };
});

let ctx: Awaited<ReturnType<typeof startDemo>>;
let funnel: Funnel;
beforeEach(async () => {
  retraso.ms = 25;
  vi.mocked(funnelsService.saveContent).mockReset();
  vi.mocked(funnelsService.getFunnel).mockReset();
  ctx = await startDemo();
  funnel = await seedFunnel(ctx.token, ctx.workspace, { name: 'Curso de Excel', brief: { result: 'Ahorra 5 horas a la semana', offer: 'Un curso en línea' } });
  // Lo que hizo el montaje (crear el funnel de prueba) no cuenta: solo lo que haga el editor.
  vi.mocked(funnelsService.saveContent).mockClear();
  vi.mocked(funnelsService.getFunnel).mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const user = () => userEvent.setup({ delay: null });
const guardados = () => vi.mocked(funnelsService.saveContent).mock.calls;
const persistido = () => getFunnel(ctx.token, funnel.id);
const lista = () => screen.getByRole('navigation', { name: /bloques de la página/i });
const lienzo = () => screen.getByRole('article', { name: 'Página' });
const panel = (nombre: string) => screen.getByRole('region', { name: `Propiedades: ${nombre}` });
const estado = () => screen.getByRole('status');
const enLista = (nombre: RegExp | string) => within(lista()).getByRole('button', { name: nombre });
const bloqueEnPagina = (key: string) => lienzo().querySelector(`[data-block-key="${key}"]`) as HTMLElement;
const elemento = (p: HTMLElement, nombre: string) => within(p).getByRole('group', { name: nombre });
const tipos = (blocks: Block[]) => blocks.map((b) => b.type);

async function abrir(id = funnel.id) {
  const vista = montar(`/funnels/${id}/editor`);
  await screen.findByRole('navigation', { name: /bloques de la página/i });
  return vista;
}
/** Espera a que se haya guardado al menos `minimo` veces y a que el estado vuelva a «Guardado». */
const esperarGuardado = async (minimo = 1) => {
  await waitFor(() => expect(guardados().length).toBeGreaterThanOrEqual(minimo));
  await waitFor(() => expect(estado()).toHaveTextContent('Guardado'));
};

describe('abrir el editor', () => {
  it('muestra la página generada: el nombre, la plantilla, los bloques en orden y la página dibujada', async () => {
    await abrir();
    expect(within(screen.getByRole('banner')).getByText('Curso de Excel')).toBeInTheDocument();
    expect(screen.getByText('Plantilla Claridad')).toBeInTheDocument();
    const filas = within(lista()).getAllByRole('listitem');
    expect(filas).toHaveLength(5);
    ['Encabezado', 'Beneficios', 'Testimonios', 'Formulario', 'Preguntas frecuentes'].forEach((nombre, i) => {
      expect(within(filas[i]!).getAllByRole('button')[0]).toHaveTextContent(new RegExp(`^${nombre}`));
    });
    expect(within(lienzo()).getByRole('heading', { level: 1, name: 'Ahorra 5 horas a la semana' })).toBeInTheDocument();
    expect(within(bloqueEnPagina('encabezado')).getByText('Un curso en línea')).toBeInTheDocument();
  });

  it('el logotipo completo va arriba a la izquierda y hay un enlace para volver a los funnels', async () => {
    const { router } = await abrir();
    const encabezado = screen.getByRole('banner');
    expect(encabezado.firstElementChild).toBe(screen.getByRole('img', { name: 'Original Flow' }));
    await userEvent.click(within(encabezado).getByRole('link', { name: /funnels/i }));
    await screen.findByRole('heading', { name: 'Funnels' });
    expect(router.state.location.pathname).toBe('/funnels');
  });

  it('empieza con el primer bloque elegido y sus campos a la derecha', async () => {
    await abrir();
    expect(enLista(/^Encabezado/)).toHaveAttribute('aria-current', 'true');
    const campos = panel('Encabezado');
    expect(within(campos).getByLabelText('Título')).toHaveValue('Ahorra 5 horas a la semana');
    expect(within(campos).getByLabelText('Subtítulo')).toHaveValue('Un curso en línea');
  });

  it('mientras carga dice que está abriendo la página', async () => {
    const real = await vi.importActual<typeof import('@/services/funnels')>('@/services/funnels');
    let soltar: () => void = () => undefined;
    vi.mocked(getFunnel).mockImplementationOnce(
      (token, id) =>
        new Promise((resolver) => {
          soltar = () => resolver(real.getFunnel(token, id));
        }),
    );
    montar(`/funnels/${funnel.id}/editor`);
    expect(await screen.findByText(/abriendo tu página/i)).toBeInTheDocument();
    await waitFor(() => expect(getFunnel).toHaveBeenCalled()); // el efecto pide el funnel un instante después de dibujar
    soltar();
    await screen.findByRole('navigation', { name: /bloques de la página/i });
  });

  it('un funnel que no existe (o es de otra persona) dice que no se encontró y ofrece volver', async () => {
    const { router } = montar('/funnels/00000000-0000-4000-8000-000000000000/editor');
    expect(await screen.findByRole('heading', { name: /no encontramos este funnel/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /volver a mis funnels/i }));
    await screen.findByRole('heading', { name: 'Funnels' });
    expect(router.state.location.pathname).toBe('/funnels');
  });

  it('el funnel de otra persona responde como si no existiera', async () => {
    const { session: tokenBeto } = await createSession();
    await mockCallback(tokenBeto, { email: 'beto@correo.com' });
    const negocioBeto = await createWorkspace(tokenBeto, { name: 'De Beto' });
    const ajeno = await seedFunnel(tokenBeto, negocioBeto, { name: 'Ajeno' });
    montar(`/funnels/${ajeno.id}/editor`);
    expect(await screen.findByRole('heading', { name: /no encontramos este funnel/i })).toBeInTheDocument();
  });

  it('si no se puede abrir avisa y deja reintentar', async () => {
    vi.mocked(getFunnel).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    montar(`/funnels/${funnel.id}/editor`);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo abrir el funnel/i);
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    await screen.findByRole('navigation', { name: /bloques de la página/i });
  });

  it('es una pantalla privada y exige tener un negocio', async () => {
    sessionStorage.clear();
    const { router } = montar(`/funnels/${funnel.id}/editor`);
    await screen.findByRole('heading', { name: /inicia sesión/i });
    expect(router.state.location.pathname).toBe('/login');
  });
});

describe('elegir bloques', () => {
  it('elegir un bloque en la lista muestra sus campos', async () => {
    await abrir();
    await userEvent.click(enLista(/^Preguntas frecuentes/));
    expect(enLista(/^Preguntas frecuentes/)).toHaveAttribute('aria-current', 'true');
    expect(enLista(/^Encabezado/)).not.toHaveAttribute('aria-current');
    expect(within(elemento(panel('Preguntas frecuentes'), 'Pregunta 1')).getByLabelText('Pregunta')).toHaveValue('¿Para quién es?');
  });

  it('un clic en la página elige el bloque', async () => {
    await abrir();
    fireEvent.click(lienzo().querySelector('[data-block-key="faq"]')!);
    expect(enLista(/^Preguntas frecuentes/)).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('region', { name: 'Propiedades: Preguntas frecuentes' })).toBeInTheDocument();
  });

  it('el bloque elegido se marca en la página con su nombre', async () => {
    await abrir();
    expect(within(lienzo()).getByText('Encabezado')).toBeInTheDocument();
    fireEvent.click(lienzo().querySelector('[data-block-key="beneficios"]')!);
    expect(within(lienzo()).getByText('Beneficios')).toBeInTheDocument();
    expect(within(lienzo()).queryByText('Encabezado')).not.toBeInTheDocument();
  });
});

describe('editar y autoguardar', () => {
  it('lo que se escribe se ve al instante en la página y se guarda solo', async () => {
    retraso.ms = 400; // el aviso de «sin guardar» dura lo suficiente para verlo, aunque la máquina esté ocupada
    await abrir();
    const titulo = within(panel('Encabezado')).getByLabelText('Título');
    const u = user();
    await u.clear(titulo);
    await u.type(titulo, 'Un título nuevo');
    expect(within(lienzo()).getByRole('heading', { level: 1, name: 'Un título nuevo' })).toBeInTheDocument();
    expect(estado()).toHaveTextContent(/cambios sin guardar/i);
    await esperarGuardado(1);
    const guardado = await persistido();
    expect(guardado.content.blocks[0]?.content).toMatchObject({ title: 'Un título nuevo', subtitle: 'Un curso en línea' });
    expect(guardado.content.blocks).toHaveLength(5);
  });

  it('varios cambios seguidos se guardan juntos (una sola petición)', async () => {
    retraso.ms = 400; // más largo que lo que tardan los tres cambios, aunque la máquina esté ocupada
    await abrir();
    const u = user();
    const titulo = within(panel('Encabezado')).getByLabelText('Título');
    await u.type(titulo, ' uno');
    await u.type(within(panel('Encabezado')).getByLabelText('Subtítulo'), ' dos');
    await u.type(titulo, ' tres');
    await esperarGuardado(1);
    expect(guardados()).toHaveLength(1);
    expect((await persistido()).content.blocks[0]?.content).toMatchObject({ title: 'Ahorra 5 horas a la semana uno tres', subtitle: 'Un curso en línea dos' });
  });

  it('se manda la página completa, con los bloques numerados desde 1 y sin perder el estilo', async () => {
    await abrir();
    await user().type(within(panel('Encabezado')).getByLabelText('Título'), '!');
    await esperarGuardado(1);
    const [, id, bloques] = guardados()[0]!;
    expect(id).toBe(funnel.id);
    expect(bloques.map((b) => b.order)).toEqual([1, 2, 3, 4, 5]);
    expect(bloques.every((b) => typeof b.style === 'object')).toBe(true);
  });

  it('un campo opcional que se deja vacío se quita del contenido (no se guarda un texto vacío)', async () => {
    await abrir();
    await user().clear(within(panel('Encabezado')).getByLabelText('Subtítulo'));
    expect(estado()).not.toHaveTextContent(/corrige/i);
    await esperarGuardado(1);
    const contenido = (await persistido()).content.blocks[0]!.content;
    expect(contenido).toEqual({ title: 'Ahorra 5 horas a la semana' });
    expect(within(bloqueEnPagina('encabezado')).queryByText('Un curso en línea')).not.toBeInTheDocument();
  });

  it('un campo obligatorio vacío se marca, se avisa en la lista y en el estado, y NO se guarda', async () => {
    await abrir();
    const titulo = within(panel('Encabezado')).getByLabelText('Título');
    await user().clear(titulo);
    expect(titulo).toBeInvalid();
    expect(within(panel('Encabezado')).getByText('Este campo es obligatorio.')).toBeInTheDocument();
    expect(within(lista()).getByRole('img', { name: /campos por corregir/i })).toBeInTheDocument();
    expect(estado()).toHaveTextContent(/corrige los campos marcados/i);
    await new Promise((r) => setTimeout(r, 120));
    expect(guardados()).toHaveLength(0);
  });

  it('al corregirlo se quita el aviso y se guarda', async () => {
    await abrir();
    const u = user();
    const titulo = within(panel('Encabezado')).getByLabelText('Título');
    await u.clear(titulo);
    await u.type(titulo, 'Corregido');
    expect(titulo).toBeValid();
    expect(within(lista()).queryByRole('img', { name: /campos por corregir/i })).not.toBeInTheDocument();
    await esperarGuardado(1);
    expect((await persistido()).content.blocks[0]?.content).toMatchObject({ title: 'Corregido' });
  });

  it('un texto más largo de lo permitido se marca con el máximo', async () => {
    await abrir();
    fireEvent.change(within(panel('Encabezado')).getByLabelText('Título'), { target: { value: 'a'.repeat(201) } });
    expect(within(panel('Encabezado')).getByText('Máximo 200 caracteres.')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 80));
    expect(guardados()).toHaveLength(0);
  });

  it('si el servidor rechaza el contenido (422) marca el campo que dice y no da por guardado', async () => {
    await abrir();
    vi.mocked(funnelsService.saveContent).mockRejectedValueOnce(new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'blocks.0.content.subtitle', message: 'El servidor no lo acepta' }], 'req_1'));
    await user().type(within(panel('Encabezado')).getByLabelText('Título'), '!');
    expect(await within(panel('Encabezado')).findByText('El servidor no lo acepta')).toBeInTheDocument();
    expect(estado()).toHaveTextContent(/corrige los campos marcados/i);
    expect(within(lista()).getByRole('img', { name: /campos por corregir/i })).toBeInTheDocument();
    // Al volver a cambiar algo, se vuelve a intentar.
    await user().type(within(panel('Encabezado')).getByLabelText('Título'), '?');
    await esperarGuardado(2);
  });

  it('sin conexión avisa «No se pudo guardar», conserva lo escrito y reintenta', async () => {
    await abrir();
    vi.mocked(funnelsService.saveContent).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor.'));
    await user().type(within(panel('Encabezado')).getByLabelText('Título'), ' final');
    await waitFor(() => expect(estado()).toHaveTextContent(/no se pudo guardar/i));
    expect(within(panel('Encabezado')).getByLabelText('Título')).toHaveValue('Ahorra 5 horas a la semana final');
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    await esperarGuardado(2);
    expect((await persistido()).content.blocks[0]?.content).toMatchObject({ title: 'Ahorra 5 horas a la semana final' });
  });

  it('un cambio hecho mientras se guarda se guarda después, y lo último gana', async () => {
    await abrir();
    const real = await vi.importActual<typeof import('@/services/funnels')>('@/services/funnels');
    let liberar: () => void = () => undefined;
    vi.mocked(funnelsService.saveContent).mockImplementationOnce(
      (token, id, bloques) =>
        new Promise((resolver) => {
          liberar = () => resolver(real.saveContent(token, id, bloques));
        }),
    );
    const u = user();
    const titulo = within(panel('Encabezado')).getByLabelText('Título');
    await u.type(titulo, ' A');
    await waitFor(() => expect(guardados()).toHaveLength(1));
    expect(estado()).toHaveTextContent(/guardando/i);
    await u.type(titulo, 'B');
    await waitFor(() => expect(estado()).toHaveTextContent(/cambios sin guardar|guardando/i));
    await new Promise((r) => setTimeout(r, 80)); // el segundo guardado ya quiso salir, pero espera al primero
    expect(guardados()).toHaveLength(1);
    liberar();
    await esperarGuardado(2);
    expect(guardados()[1]![2][0]?.content.title).toBe('Ahorra 5 horas a la semana AB');
    expect((await persistido()).content.blocks[0]?.content.title).toBe('Ahorra 5 horas a la semana AB');
  });

  it('al salir de la pantalla con cambios pendientes los guarda', async () => {
    retraso.ms = 60_000; // solo el guardado al salir puede guardarlo
    const { router } = await abrir();
    await user().type(within(panel('Encabezado')).getByLabelText('Título'), ' pendiente');
    expect(guardados()).toHaveLength(0);
    await router.navigate('/funnels');
    await waitFor(() => expect(guardados()).toHaveLength(1));
    await screen.findByRole('heading', { name: 'Funnels' });
    await waitFor(async () => expect((await persistido()).content.blocks[0]?.content.title).toBe('Ahorra 5 horas a la semana pendiente'));
  });

  it('salir con cambios que no se pudieron guardar pide confirmar; si se cancela, se queda', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { router } = await abrir();
    await user().clear(within(panel('Encabezado')).getByLabelText('Título'));
    await userEvent.click(within(screen.getByRole('banner')).getByRole('link', { name: /funnels/i }));
    expect(confirmar).toHaveBeenCalledWith(expect.stringMatching(/cambios que no se guardaron/i));
    expect(router.state.location.pathname).toBe(`/funnels/${funnel.id}/editor`);
    expect(within(panel('Encabezado')).getByLabelText('Título')).toHaveValue('');
  });

  it('si se confirma, sale (los cambios con errores se pierden)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { router } = await abrir();
    await user().clear(within(panel('Encabezado')).getByLabelText('Título'));
    await userEvent.click(within(screen.getByRole('banner')).getByRole('link', { name: /funnels/i }));
    await screen.findByRole('heading', { name: 'Funnels' });
    expect(router.state.location.pathname).toBe('/funnels');
    expect((await persistido()).content.blocks[0]?.content.title).toBe('Ahorra 5 horas a la semana');
  });

  it('salir sin cambios pendientes no pregunta nada', async () => {
    const confirmar = vi.spyOn(window, 'confirm');
    await abrir();
    await userEvent.click(within(screen.getByRole('banner')).getByRole('link', { name: /funnels/i }));
    await screen.findByRole('heading', { name: 'Funnels' });
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('con cambios sin guardar avisa al cerrar la pestaña (beforeunload)', async () => {
    await abrir();
    const antes = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(antes);
    expect(antes.defaultPrevented).toBe(false);
    await user().clear(within(panel('Encabezado')).getByLabelText('Título'));
    const despues = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(despues);
    expect(despues.defaultPrevented).toBe(true);
  });
});

describe('agregar, quitar y mover bloques', () => {
  it('agrega un bloque después del elegido, lo elige y lo guarda', async () => {
    await abrir();
    await userEvent.click(enLista(/^Beneficios/));
    await userEvent.click(screen.getByRole('button', { name: /agregar bloque/i }));
    const disponibles = screen.getByRole('list', { name: /bloques disponibles/i });
    expect(within(disponibles).getAllByRole('button')).toHaveLength(14); // todos menos «logos»
    expect(within(disponibles).queryByText('Logos')).not.toBeInTheDocument();
    await userEvent.click(within(disponibles).getByRole('button', { name: /^Texto/ }));
    expect(screen.getByRole('region', { name: 'Propiedades: Texto' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /bloques disponibles/i })).not.toBeInTheDocument();
    await esperarGuardado(1);
    const guardado = await persistido();
    expect(tipos(guardado.content.blocks)).toEqual(['encabezado', 'beneficios', 'texto', 'testimonios', 'formulario', 'faq']);
    expect(guardado.content.blocks.map((b) => b.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('el bloque nuevo nace con contenido válido y se ve en la página', async () => {
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: /agregar bloque/i }));
    await userEvent.click(within(screen.getByRole('list', { name: /bloques disponibles/i })).getByRole('button', { name: /^Botón/ }));
    expect(within(lienzo()).getByText('Quiero empezar')).toBeInTheDocument();
    expect(estado()).not.toHaveTextContent(/corrige/i);
    await esperarGuardado(1);
  });

  it('dos bloques del mismo tipo reciben claves distintas', async () => {
    await abrir();
    for (let i = 0; i < 2; i += 1) {
      await userEvent.click(screen.getByRole('button', { name: /agregar bloque/i }));
      await userEvent.click(within(screen.getByRole('list', { name: /bloques disponibles/i })).getByRole('button', { name: /^Botón/ }));
    }
    await waitFor(async () => expect((await persistido()).content.blocks.filter((b) => b.type === 'boton').map((b) => b.key)).toEqual(['boton', 'boton-2']));
  });

  it('se puede cerrar la lista de bloques sin agregar nada', async () => {
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: /agregar bloque/i }));
    await userEvent.click(screen.getByRole('button', { name: /cerrar la lista de bloques/i }));
    expect(screen.queryByRole('list', { name: /bloques disponibles/i })).not.toBeInTheDocument();
    expect(guardados()).toHaveLength(0);
  });

  it('quitar un bloque pide confirmar, lo quita, elige el siguiente y lo guarda', async () => {
    await abrir();
    await userEvent.click(enLista(/^Testimonios/));
    await userEvent.click(screen.getByRole('button', { name: /quitar bloque/i }));
    expect(screen.getByText('¿Quitar este bloque?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /sí, quitar/i }));
    expect(within(lista()).queryByRole('button', { name: /^Testimonios/ })).not.toBeInTheDocument();
    expect(enLista(/^Formulario/)).toHaveAttribute('aria-current', 'true');
    await esperarGuardado(1);
    expect(tipos((await persistido()).content.blocks)).toEqual(['encabezado', 'beneficios', 'formulario', 'faq']);
  });

  it('cancelar la confirmación deja todo como estaba', async () => {
    await abrir();
    await userEvent.click(enLista(/^Testimonios/));
    await userEvent.click(screen.getByRole('button', { name: /quitar bloque/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(screen.queryByText('¿Quitar este bloque?')).not.toBeInTheDocument();
    expect(within(lista()).getAllByRole('listitem')).toHaveLength(5);
    expect(guardados()).toHaveLength(0);
  });

  it('al quitar el último bloque la página queda vacía, con avisos claros', async () => {
    const solo = await seedFunnel(ctx.token, ctx.workspace, { name: 'Solo uno', blocks: [block('hero', 'encabezado', { title: 'Único' })] });
    await abrir(solo.id);
    await userEvent.click(screen.getByRole('button', { name: /quitar bloque/i }));
    await userEvent.click(screen.getByRole('button', { name: /sí, quitar/i }));
    expect(within(lista()).getByText(/no tiene bloques/i)).toBeInTheDocument();
    expect(within(lienzo()).getByText(/todavía no tiene bloques/i)).toBeInTheDocument();
    expect(screen.getByText(/elige un bloque de la lista/i)).toBeInTheDocument();
  });

  it('sube y baja bloques, y lo guarda; en los extremos el botón no se puede usar', async () => {
    await abrir();
    await userEvent.click(enLista(/^Encabezado/));
    expect(screen.getByRole('button', { name: 'Subir bloque' })).toBeDisabled();
    await userEvent.click(enLista(/^Preguntas frecuentes/));
    expect(screen.getByRole('button', { name: 'Bajar bloque' })).toBeDisabled();

    await userEvent.click(enLista(/^Formulario/));
    await userEvent.click(screen.getByRole('button', { name: 'Subir bloque' }));
    await userEvent.click(screen.getByRole('button', { name: 'Subir bloque' }));
    await esperarGuardado(1);
    expect(tipos((await persistido()).content.blocks)).toEqual(['encabezado', 'formulario', 'beneficios', 'testimonios', 'faq']);
    expect(within(lienzo()).getAllByRole('heading').map((h) => h.textContent)[0]).toBe('Ahorra 5 horas a la semana');
  });

  it('con 60 bloques ya no deja agregar más', async () => {
    const lleno = await seedFunnel(ctx.token, ctx.workspace, { name: 'Lleno', blocks: Array.from({ length: 60 }, (_, i) => block(`b${i}`, 'boton', { label: `Botón ${i}` }, i + 1)) });
    await abrir(lleno.id);
    expect(screen.getByRole('button', { name: /agregar bloque/i })).toBeDisabled();
    expect(screen.getByText(/máximo de 60 bloques/i)).toBeInTheDocument();
  });
});

describe('listas y campos de los bloques', () => {
  it('preguntas: agregar, mover y quitar', async () => {
    await abrir();
    await userEvent.click(enLista(/^Preguntas frecuentes/));
    const p = () => panel('Preguntas frecuentes');
    const pregunta = (n: number) => within(elemento(p(), `Pregunta ${n}`)).getByLabelText('Pregunta');
    expect(within(p()).getAllByRole('group', { name: /^Pregunta \d$/ })).toHaveLength(3);

    await userEvent.click(within(p()).getByRole('button', { name: /agregar pregunta/i }));
    expect(pregunta(4)).toHaveValue('¿Nueva pregunta?');
    await userEvent.click(within(p()).getByRole('button', { name: 'Bajar pregunta 1' }));
    expect(pregunta(2)).toHaveValue('¿Para quién es?');
    await userEvent.click(within(p()).getByRole('button', { name: 'Quitar pregunta 1' }));
    await esperarGuardado(1);
    const items = (await persistido()).content.blocks[4]!.content.items as { question: string }[];
    expect(items.map((i) => i.question)).toEqual(['¿Para quién es?', '¿Qué pasa después?', '¿Nueva pregunta?']);
  });

  it('el mínimo de elementos se respeta: con uno solo, «Quitar» está deshabilitado', async () => {
    const uno = await seedFunnel(ctx.token, ctx.workspace, { name: 'Con una', blocks: [block('faq', 'faq', { items: [{ question: '¿Una?', answer: 'Sí.' }] })] });
    await abrir(uno.id);
    expect(within(panel('Preguntas frecuentes')).getByRole('button', { name: 'Quitar pregunta 1' })).toBeDisabled();
  });

  it('el máximo de elementos se respeta: con 6 planes ya no deja agregar', async () => {
    const planes = Array.from({ length: 6 }, (_, i) => ({ name: `Plan ${i + 1}`, price: i, features: [] }));
    const seis = await seedFunnel(ctx.token, ctx.workspace, { name: 'Seis planes', blocks: [block('precios', 'precios', { plans: planes })] });
    await abrir(seis.id);
    expect(within(panel('Precios')).getByRole('button', { name: /agregar plan/i })).toBeDisabled();
  });

  it('una lista de textos simples (requisitos) se agrega y se edita', async () => {
    const r = await seedFunnel(ctx.token, ctx.workspace, { name: 'Requisitos', objective: 'aplicacion' });
    await abrir(r.id);
    await userEvent.click(enLista(/^Requisitos/));
    await userEvent.click(within(panel('Requisitos')).getByRole('button', { name: /agregar requisito/i }));
    const nuevo = within(panel('Requisitos')).getByLabelText('Requisito 3');
    expect(nuevo).toHaveValue('Nuevo requisito');
    const u = user();
    await u.clear(nuevo);
    await u.type(nuevo, 'Tener 18 años');
    await waitFor(async () => expect(((await getFunnel(ctx.token, r.id)).content.blocks[1]!.content.items as string[])[2]).toBe('Tener 18 años'));
  });

  it('formulario: cambiar un campo a «lista de opciones» muestra sus opciones, y «obligatorio» se guarda', async () => {
    await abrir();
    await userEvent.click(enLista(/^Formulario/));
    const f = () => panel('Formulario');
    expect(within(f()).queryByRole('button', { name: /agregar opción/i })).not.toBeInTheDocument();
    await userEvent.selectOptions(within(f()).getAllByLabelText('Tipo de campo')[2]!, 'select');
    await userEvent.click(within(f()).getByRole('button', { name: /agregar opción/i }));
    expect(within(f()).getByLabelText('Opción 1')).toHaveValue('Nueva opción');
    await userEvent.click(within(f()).getAllByLabelText('Es obligatorio')[2]!);
    await esperarGuardado(1);
    const campo = ((await persistido()).content.blocks[3]!.content.fields as Record<string, unknown>[])[2]!;
    expect(campo).toMatchObject({ type: 'select', required: true, options: ['Nueva opción'] });
  });

  it('formulario: un identificador inválido se marca y no se guarda', async () => {
    await abrir();
    await userEvent.click(enLista(/^Formulario/));
    fireEvent.change(within(panel('Formulario')).getAllByLabelText('Identificador interno')[0]!, { target: { value: 'mi campo' } });
    expect(within(panel('Formulario')).getByText(/debe empezar con una letra/i)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 80));
    expect(guardados()).toHaveLength(0);
  });

  it('el texto del botón del formulario es obligatorio', async () => {
    await abrir();
    await userEvent.click(enLista(/^Formulario/));
    await user().clear(within(panel('Formulario')).getByLabelText('Texto del botón de envío'));
    expect(within(panel('Formulario')).getByText('Este campo es obligatorio.')).toBeInTheDocument();
  });

  it('cuenta regresiva: elegir fecha y hora se guarda como fecha ISO; vaciarla se marca', async () => {
    const c = await seedFunnel(ctx.token, ctx.workspace, { name: 'Contador', blocks: [block('contador', 'contador', { endsAt: '2030-01-01T10:00:00.000Z', label: 'Termina' })] });
    await abrir(c.id);
    const campo = within(panel('Cuenta regresiva')).getByLabelText('Termina el');
    fireEvent.change(campo, { target: { value: '2030-01-15T10:30' } });
    await esperarGuardado(1);
    expect((await getFunnel(ctx.token, c.id)).content.blocks[0]!.content.endsAt).toBe(new Date('2030-01-15T10:30').toISOString());
    fireEvent.change(campo, { target: { value: '' } });
    expect(within(panel('Cuenta regresiva')).getByText('Elige una fecha y una hora.')).toBeInTheDocument();
  });

  it('precios: el número se guarda como número y un negativo se marca', async () => {
    const v = await seedFunnel(ctx.token, ctx.workspace, { name: 'Venta', objective: 'venta' });
    await abrir(v.id);
    await userEvent.click(enLista(/^Precios/));
    const precio = within(panel('Precios')).getByLabelText('Precio');
    fireEvent.change(precio, { target: { value: '1490' } });
    await esperarGuardado(1);
    expect(((await getFunnel(ctx.token, v.id)).content.blocks[3]!.content.plans as { price: unknown }[])[0]!.price).toBe(1490);
    fireEvent.change(precio, { target: { value: '-5' } });
    expect(within(panel('Precios')).getByText('Debe ser un número, mínimo 0.')).toBeInTheDocument();
    fireEvent.change(precio, { target: { value: '' } });
    expect(within(panel('Precios')).getByText('Este campo es obligatorio.')).toBeInTheDocument();
  });

  it('imagen: sin dirección se marca; con una válida se ve en la página', async () => {
    const m = await seedFunnel(ctx.token, ctx.workspace, { name: 'Recurso', objective: 'magnet' });
    await abrir(m.id);
    await userEvent.click(enLista(/^Imagen/));
    const url = within(panel('Imagen')).getByLabelText('Dirección de la imagen');
    await user().clear(url);
    expect(within(panel('Imagen')).getByText('Agrega la dirección de la imagen.')).toBeInTheDocument();
    fireEvent.change(url, { target: { value: 'hola' } });
    expect(within(panel('Imagen')).getByText(/dirección válida/i)).toBeInTheDocument();
    fireEvent.change(url, { target: { value: 'https://img.test/a.png' } });
    expect(within(lienzo()).getByAltText(/portada de/i)).toHaveAttribute('src', 'https://img.test/a.png');
  });

  it('cada campo de texto largo se edita con su área de texto', async () => {
    const t = await seedFunnel(ctx.token, ctx.workspace, { name: 'Texto', blocks: [block('texto', 'texto', { title: 'Título', body: 'Línea uno' })] });
    await abrir(t.id);
    const cuerpo = within(panel('Texto')).getByLabelText('Texto');
    expect(cuerpo.tagName).toBe('TEXTAREA');
    await user().type(cuerpo, '{Enter}Línea dos');
    expect(within(lienzo()).getByText(/Línea uno\s*Línea dos/)).toBeInTheDocument();
  });
});

describe('la página dibujada', () => {
  it('dibuja cada tipo de bloque con su contenido, sin romperse', async () => {
    const contenidos = Object.fromEntries(BLOCK_TYPES.map((t) => [t, t === 'logos' ? { fileIds: ['a', 'b'] } : BLOCKS[t].create()]));
    const todos = BLOCK_TYPES.map((t, i) => block(t, t, contenidos[t]!, i + 1));
    const f = await seedFunnel(ctx.token, ctx.workspace, { name: 'Todos', blocks: todos });
    await abrir(f.id);
    const pagina = lienzo();
    for (const texto of ['Título de tu página', 'Sobre esto', 'Tu video', 'Déjanos tus datos', 'Quiero empezar', 'La oferta termina en', 'Nombre Apellido', '¿Pregunta frecuente?', 'Lo que obtienes', 'Elige tu horario', 'Tema', 'Primer requisito', 'Beneficio incluido']) {
      expect(within(pagina).getAllByText(texto).length, texto).toBeGreaterThan(0);
    }
    expect(within(pagina).getByAltText('Imagen')).toBeInTheDocument();
    expect(within(pagina).getAllByText('Logo')).toHaveLength(2);
    expect(within(lista()).getAllByRole('listitem')).toHaveLength(BLOCK_TYPES.length);
  });

  it('el panel de cada tipo de bloque se muestra con sus campos (y «logos» avisa que falta el almacenamiento)', async () => {
    const todos = BLOCK_TYPES.map((t, i) => block(t, t, t === 'logos' ? { fileIds: ['a'] } : BLOCKS[t].create(), i + 1));
    const f = await seedFunnel(ctx.token, ctx.workspace, { name: 'Todos', blocks: todos });
    await abrir(f.id);
    for (const t of BLOCK_TYPES) {
      await userEvent.click(within(lista()).getAllByRole('button', { name: new RegExp(`^${BLOCKS[t].label}`) })[0]!);
      const p = screen.getByRole('region', { name: `Propiedades: ${BLOCKS[t].label}` });
      if (t === 'logos') expect(within(p).getByText(/almacenamiento de archivos/i)).toBeInTheDocument();
      else expect(p.querySelectorAll('input, textarea, select').length, t).toBeGreaterThan(0);
    }
  });

  it('usa los colores del diseño de la página (la marca del cliente), no los de la plataforma', async () => {
    await abrir();
    expect(lienzo()).toHaveStyle({ backgroundColor: '#EAF4F0', color: '#0F1F1A' });
    expect(lienzo()).toHaveAttribute('data-template', 'claridad');
  });

  it('con la plantilla «impacto» usa su paleta y su nombre aparece arriba', async () => {
    const f = await seedFunnel(ctx.token, ctx.workspace, { name: 'Impactante', templateId: 'impacto' });
    await abrir(f.id);
    expect(lienzo()).toHaveStyle({ backgroundColor: '#FAEEEA' });
    expect(lienzo()).toHaveAttribute('data-template', 'impacto');
    expect(screen.getByText('Plantilla Impacto')).toBeInTheDocument();
  });

  it('un funnel sin diseño guardado usa la plantilla «claridad» por defecto', async () => {
    const f = await createFunnel(ctx.token, { workspaceId: ctx.workspace.id, name: 'Sin diseño', objective: 'leads' });
    await funnelsService.saveContent(ctx.token, f.id, [block('hero', 'encabezado', { title: 'Hola' })]);
    await abrir(f.id);
    expect(lienzo()).toHaveAttribute('data-template', 'claridad');
    expect(screen.getByText('Plantilla Claridad')).toBeInTheDocument();
  });

  it('un funnel de venta muestra el precio con su divisa', async () => {
    const v = await seedFunnel(ctx.token, ctx.workspace, { name: 'Venta', objective: 'venta', brief: { price: '$1,490 MXN' } });
    await abrir(v.id);
    expect(within(bloqueEnPagina('precios')).getByText(/1,490/)).toBeInTheDocument();
  });
});

describe('vista previa', () => {
  it('oculta los paneles y las marcas de selección, y se puede volver a editar conservando la selección', async () => {
    await abrir();
    await userEvent.click(enLista(/^Preguntas frecuentes/));
    const boton = screen.getByRole('button', { name: /vista previa/i });
    expect(boton).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(boton);
    expect(screen.queryByRole('navigation', { name: /bloques de la página/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /propiedades/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /volver a editar/i })).toHaveAttribute('aria-pressed', 'true');
    expect(within(lienzo()).queryByText('Preguntas frecuentes', { selector: 'span' })).not.toBeInTheDocument();
    fireEvent.click(lienzo().querySelector('[data-block-key="beneficios"]')!);
    expect(screen.queryByRole('region', { name: /propiedades/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /volver a editar/i }));
    expect(enLista(/^Preguntas frecuentes/)).toHaveAttribute('aria-current', 'true');
  });
});
