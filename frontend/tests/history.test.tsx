import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api';
import { getFunnel, publishFunnel, type Funnel } from '@/services/funnels';
import * as historyService from '@/services/history';
import { MAX_LABEL } from '@/shared/history';
import { seedFunnel, startDemo } from './helpers/demoApp';
import { editarBaseDeDemostracion } from './helpers/publicApp';
import { montar } from './helpers/renderApp';

// El autoguardado espera poco; algunas pruebas lo alargan para dejar un cambio pendiente.
const retraso = vi.hoisted(() => ({ ms: 25 }));
vi.mock('@/features/editor/constants', () => ({
  get AUTOSAVE_DELAY_MS() {
    return retraso.ms;
  },
}));
vi.mock('@/services/history', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/history')>();
  return { ...original, listHistory: vi.fn(original.listHistory), saveVersion: vi.fn(original.saveVersion), restoreVersion: vi.fn(original.restoreVersion) };
});

const ORIGINAL = 'Ahorra 5 horas a la semana';
let ctx: Awaited<ReturnType<typeof startDemo>>;
let funnel: Funnel;

beforeEach(async () => {
  retraso.ms = 25;
  for (const fn of [historyService.listHistory, historyService.saveVersion, historyService.restoreVersion]) vi.mocked(fn).mockReset();
  ctx = await startDemo();
  const creado = await seedFunnel(ctx.token, ctx.workspace, { name: 'Curso de Excel', brief: { result: ORIGINAL, offer: 'Un curso en línea' } });
  funnel = await getFunnel(ctx.token, creado.id);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const lienzo = () => screen.getByRole('article', { name: 'Página' });
const tituloEnLienzo = () => within(lienzo()).getByRole('heading', { level: 1 }).textContent;
/** El estado del guardado, en la barra superior (el diálogo tiene sus propios avisos). */
const estado = () => within(screen.getByRole('banner')).getByRole('status');
const dialogo = () => screen.getByRole('dialog', { name: 'Historial de versiones' });
const versiones = () => within(dialogo()).queryAllByRole('listitem');
const etiquetas = () => versiones().map((li) => within(li).getByText(/./, { selector: 'p.font-medium' }).textContent);
const persistido = () => getFunnel(ctx.token, funnel.id);

async function abrir() {
  const vista = montar(`/funnels/${funnel.id}/editor`);
  await screen.findByRole('navigation', { name: /bloques de la página/i });
  return vista;
}
async function abrirHistorial() {
  await userEvent.click(screen.getByRole('button', { name: 'Historial de versiones' }));
  await screen.findByRole('dialog', { name: 'Historial de versiones' });
  await waitFor(() => expect(within(dialogo()).queryByText('Cargando las versiones…')).not.toBeInTheDocument());
}
/** Cambia el título del encabezado desde el panel de propiedades, como lo haría quien edita. */
async function escribirTitulo(texto: string) {
  const campos = screen.getByRole('region', { name: 'Propiedades: Encabezado' });
  fireEvent.change(within(campos).getByLabelText('Título'), { target: { value: texto } });
}
const guardada = (nombre: string) => historyService.saveVersion(ctx.token, funnel.id, nombre);
const botonRestaurar = (nombre: string) => within(dialogo()).getByRole('button', { name: `Restaurar ${nombre}` });
const pausa = () => new Promise((r) => setTimeout(r, 5));

describe('abrir el historial', () => {
  it('un botón en la barra del editor abre el diálogo, que se cierra con Escape y con la X', async () => {
    await abrir();
    await abrirHistorial();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await abrirHistorial();
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un funnel sin versiones lo explica', async () => {
    await abrir();
    await abrirHistorial();
    expect(within(dialogo()).getByText(/todavía no hay versiones/i)).toBeInTheDocument();
    expect(within(dialogo()).queryByRole('list')).not.toBeInTheDocument();
  });

  it('mientras carga lo avisa', async () => {
    await abrir();
    const real = (await vi.importActual<typeof import('@/services/history')>('@/services/history')).listHistory;
    let soltar: () => void = () => undefined;
    vi.mocked(historyService.listHistory).mockImplementationOnce((token, id, signal) => new Promise((resolver) => (soltar = () => resolver(real(token, id, signal)))));
    await userEvent.click(screen.getByRole('button', { name: 'Historial de versiones' }));
    expect(await screen.findByText('Cargando las versiones…')).toBeInTheDocument();
    await waitFor(() => expect(historyService.listHistory).toHaveBeenCalled());
    soltar();
    await waitFor(() => expect(screen.queryByText('Cargando las versiones…')).not.toBeInTheDocument());
  });

  it('si no se puede cargar avisa y deja reintentar', async () => {
    await abrir();
    vi.mocked(historyService.listHistory).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    await userEvent.click(screen.getByRole('button', { name: 'Historial de versiones' }));
    expect(await within(await screen.findByRole('dialog')).findByRole('alert')).toHaveTextContent('No se pudo cargar el historial.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(within(dialogo()).getByText(/todavía no hay versiones/i)).toBeInTheDocument());
  });

  it('muestra las versiones de la más nueva a la más vieja, con quién la guardó y cuándo', async () => {
    await guardada('Primera');
    await pausa();
    await guardada('Segunda');
    await abrir();
    await abrirHistorial();
    expect(etiquetas()).toEqual(['Segunda', 'Primera']);
    const segunda = versiones()[0]!;
    expect(within(segunda).getByText(/Ana/)).toBeInTheDocument();
    const hora = segunda.querySelector('time')!;
    expect(hora).toHaveTextContent('hace un momento');
    expect(hora.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(hora.getAttribute('title')).toMatch(/2026/);
  });

  it('una versión sin nombre se muestra como «Sin nombre» y se puede restaurar', async () => {
    await guardada('Temporal');
    editarBaseDeDemostracion((db) => {
      db.history[0].label = null;
    });
    await abrir();
    await abrirHistorial();
    expect(etiquetas()).toEqual(['Sin nombre']);
    expect(botonRestaurar('versión sin nombre')).toBeInTheDocument();
  });

  it('lo que publicar guarda («Publicado») también aparece', async () => {
    await publishFunnel(ctx.token, funnel.id);
    await abrir();
    await abrirHistorial();
    expect(etiquetas()).toEqual(['Publicado']);
  });

  it('el nombre de una versión y de quien la guardó se muestran como texto, nunca como HTML', async () => {
    await guardada('<img src=x onerror=alert(1)>');
    const { container } = await abrir();
    await abrirHistorial();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(within(dialogo()).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });
});

describe('guardar una versión', () => {
  const nombre = () => within(dialogo()).getByLabelText('Nombre de la versión');
  const guardar = () => userEvent.click(within(dialogo()).getByRole('button', { name: 'Guardar versión' }));

  it('guarda con el nombre (sin espacios sobrantes), la pone arriba, avisa y vacía el campo', async () => {
    await abrir();
    await abrirHistorial();
    await userEvent.type(nombre(), '  Antes de cambiar el precio  ');
    await guardar();
    expect(await within(dialogo()).findByRole('status')).toHaveTextContent('Versión guardada.');
    expect(etiquetas()).toEqual(['Antes de cambiar el precio']);
    expect(nombre()).toHaveValue('');
    expect(vi.mocked(historyService.saveVersion).mock.calls[0]![2]).toBe('Antes de cambiar el precio');
    expect((await historyService.listHistory(ctx.token, funnel.id)).map((v) => v.label)).toEqual(['Antes de cambiar el precio']);
  });

  it('un nombre vacío o de puros espacios se marca en el campo y no se manda', async () => {
    await abrir();
    await abrirHistorial();
    await guardar();
    expect(within(dialogo()).getByText('Ponle un nombre a la versión.')).toBeInTheDocument();
    await userEvent.type(nombre(), '   ');
    await guardar();
    expect(within(dialogo()).getByText('Ponle un nombre a la versión.')).toBeInTheDocument();
    expect(nombre()).toBeInvalid();
    expect(historyService.saveVersion).not.toHaveBeenCalled();
  });

  it('un nombre demasiado largo se marca en el campo y no se manda', async () => {
    await abrir();
    await abrirHistorial();
    fireEvent.change(nombre(), { target: { value: 'x'.repeat(MAX_LABEL + 1) } });
    await guardar();
    expect(within(dialogo()).getByText(`El nombre puede tener hasta ${MAX_LABEL} caracteres.`)).toBeInTheDocument();
    expect(historyService.saveVersion).not.toHaveBeenCalled();
  });

  it('escribir de nuevo quita el aviso del error y el del éxito', async () => {
    await abrir();
    await abrirHistorial();
    await guardar();
    await userEvent.type(nombre(), 'a');
    expect(within(dialogo()).queryByText('Ponle un nombre a la versión.')).not.toBeInTheDocument();
    await guardar();
    await within(dialogo()).findByText('Versión guardada.');
    await userEvent.type(nombre(), 'b');
    expect(within(dialogo()).queryByText('Versión guardada.')).not.toBeInTheDocument();
  });

  it('guarda también lo último que escribiste, aunque el autoguardado todavía no lo haya guardado', async () => {
    retraso.ms = 60_000;
    await abrir();
    await escribirTitulo('Título de última hora');
    expect(estado()).toHaveTextContent('Cambios sin guardar…');
    expect((await persistido()).content.blocks[0]!.content.title).toBe(ORIGINAL); // todavía no se guardó
    await abrirHistorial();
    await userEvent.type(nombre(), 'Con lo último');
    await guardar();
    await within(dialogo()).findByText('Versión guardada.');
    expect((await persistido()).content.blocks[0]!.content.title).toBe('Título de última hora');
    // Y la versión lleva ese cambio: se comprueba cambiando la página y volviendo a ella.
    await escribirTitulo('Otro título');
    await userEvent.click(botonRestaurar('Con lo último'));
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Sí, restaurar' }));
    await within(dialogo()).findByText(/versión restaurada/i);
    expect(tituloEnLienzo()).toBe('Título de última hora');
  });

  it('si la página tiene campos con errores no guarda la versión y lo explica', async () => {
    await abrir();
    await escribirTitulo('');
    await waitFor(() => expect(screen.getByText(/corrige los campos marcados para guardar/i)).toBeInTheDocument());
    await abrirHistorial();
    await userEvent.type(nombre(), 'Versión a medias');
    await guardar();
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent('Corrige los campos marcados de la página para poder guardar una versión.');
    expect(historyService.saveVersion).not.toHaveBeenCalled();
    expect(within(dialogo()).getByRole('button', { name: 'Guardar versión' })).toBeEnabled();
  });

  it('el error de validación del servidor y los demás errores se explican y se puede reintentar', async () => {
    await abrir();
    await abrirHistorial();
    await userEvent.type(nombre(), 'Una versión');
    vi.mocked(historyService.saveVersion).mockRejectedValueOnce(new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'label', message: 'El servidor no acepta ese nombre' }], 'r'));
    await guardar();
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent('El servidor no acepta ese nombre');
    vi.mocked(historyService.saveVersion).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    await guardar();
    await waitFor(() => expect(within(dialogo()).getByRole('alert')).toHaveTextContent('No se pudo guardar la versión. Inténtalo de nuevo.'));
    expect(nombre()).toHaveValue('Una versión');
    await guardar();
    expect(await within(dialogo()).findByText('Versión guardada.')).toBeInTheDocument();
    expect(within(dialogo()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mientras guarda el botón dice «Guardando…» y no se manda dos veces', async () => {
    await abrir();
    await abrirHistorial();
    vi.mocked(historyService.saveVersion).mockImplementationOnce(() => new Promise(() => undefined));
    await userEvent.type(nombre(), 'Lenta');
    await guardar();
    const boton = await within(dialogo()).findByRole('button', { name: 'Guardando…' });
    expect(boton).toBeDisabled();
    fireEvent.submit(boton.closest('form')!);
    // La primera todavía está guardando lo pendiente del editor: se espera a que llegue a pedir la versión.
    await waitFor(() => expect(historyService.saveVersion).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 60));
    expect(historyService.saveVersion).toHaveBeenCalledTimes(1);
  });
});

describe('restaurar una versión', () => {
  async function conVersionBuena() {
    await guardada('Versión buena');
    await abrir();
    // Se cambia el título y se espera a que se guarde, para tener algo que deshacer.
    await escribirTitulo('Un título que ya no quiero');
    await waitFor(() => expect(estado()).toHaveTextContent('Guardado'));
    await abrirHistorial();
  }
  const confirmar = () => userEvent.click(within(dialogo()).getByRole('button', { name: 'Sí, restaurar' }));

  it('pide confirmar antes y «Cancelar» no cambia nada', async () => {
    await conVersionBuena();
    await userEvent.click(botonRestaurar('Versión buena'));
    expect(within(dialogo()).getByText(/tu página volverá a como estaba en esta versión/i)).toBeInTheDocument();
    expect(within(dialogo()).queryByRole('button', { name: /^Restaurar Versión buena$/ })).not.toBeInTheDocument();
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }));
    expect(within(dialogo()).queryByText(/tu página volverá/i)).not.toBeInTheDocument();
    expect(botonRestaurar('Versión buena')).toBeInTheDocument();
    expect(historyService.restoreVersion).not.toHaveBeenCalled();
    expect(tituloEnLienzo()).toBe('Un título que ya no quiero');
  });

  it('devuelve la página a esa versión, avisa y deja guardada la de antes', async () => {
    await conVersionBuena();
    await userEvent.click(botonRestaurar('Versión buena'));
    await confirmar();
    expect(await within(dialogo()).findByText('Versión restaurada. Lo que tenías antes quedó guardado en el historial.')).toBeInTheDocument();
    expect(tituloEnLienzo()).toBe(ORIGINAL);
    expect(estado()).toHaveTextContent('Guardado');
    expect((await persistido()).content.blocks[0]!.content.title).toBe(ORIGINAL);
    expect(etiquetas()).toEqual(['Antes de restaurar «Versión buena»', 'Versión buena']);
    expect(within(dialogo()).queryByText(/tu página volverá/i)).not.toBeInTheDocument();
  });

  it('se puede deshacer: restaurar «Antes de restaurar…» devuelve el trabajo de antes', async () => {
    await conVersionBuena();
    await userEvent.click(botonRestaurar('Versión buena'));
    await confirmar();
    await within(dialogo()).findByText(/versión restaurada/i);
    await userEvent.click(botonRestaurar('Antes de restaurar «Versión buena»'));
    await confirmar();
    await waitFor(() => expect(tituloEnLienzo()).toBe('Un título que ya no quiero'));
  });

  it('antes de restaurar guarda lo que estaba pendiente, para no perderlo', async () => {
    await guardada('Versión buena');
    retraso.ms = 60_000;
    await abrir();
    await escribirTitulo('Trabajo sin guardar');
    await abrirHistorial();
    await userEvent.click(botonRestaurar('Versión buena'));
    await confirmar();
    await within(dialogo()).findByText(/versión restaurada/i);
    // Ese trabajo quedó en la versión de antes.
    await userEvent.click(botonRestaurar('Antes de restaurar «Versión buena»'));
    await confirmar();
    await waitFor(() => expect(tituloEnLienzo()).toBe('Trabajo sin guardar'));
  });

  it('después de restaurar el editor sigue funcionando: lo que se escribe se autoguarda', async () => {
    await conVersionBuena();
    await userEvent.click(botonRestaurar('Versión buena'));
    await confirmar();
    await within(dialogo()).findByText(/versión restaurada/i);
    await userEvent.keyboard('{Escape}');
    await escribirTitulo('Ya restaurada y editada');
    await waitFor(async () => expect((await persistido()).content.blocks[0]!.content.title).toBe('Ya restaurada y editada'));
    expect(tituloEnLienzo()).toBe('Ya restaurada y editada');
  });

  it('después de restaurar, editar un bloque no devuelve los demás a como estaban antes de restaurar', async () => {
    await guardada('Versión buena');
    await abrir();
    const original = String(funnel.content.blocks.find((b) => b.key === 'beneficios')!.content.title);
    // Se cambia otro bloque (Beneficios) y se espera a que se guarde.
    await userEvent.click(within(screen.getByRole('navigation', { name: /bloques de la página/i })).getByRole('button', { name: /^Beneficios/ }));
    // El primer «Título» del panel es el del bloque (los siguientes son los de cada beneficio).
    fireEvent.change(within(screen.getByRole('region', { name: 'Propiedades: Beneficios' })).getAllByLabelText('Título')[0]!, { target: { value: 'Beneficios cambiados' } });
    await waitFor(() => expect(estado()).toHaveTextContent('Guardado'));
    await abrirHistorial();
    await userEvent.click(botonRestaurar('Versión buena'));
    await confirmar();
    await within(dialogo()).findByText(/versión restaurada/i);
    await userEvent.keyboard('{Escape}');
    // Ahora se edita el encabezado: lo demás debe seguir como en la versión restaurada.
    await escribirTitulo('Edición posterior');
    await waitFor(async () => expect((await persistido()).content.blocks[0]!.content.title).toBe('Edición posterior'));
    const guardado = await persistido();
    expect(String(guardado.content.blocks.find((b) => b.key === 'beneficios')!.content.title)).toBe(original);
  });

  it('el primer bloque queda elegido y los errores de antes desaparecen', async () => {
    await guardada('Versión buena');
    await abrir();
    await escribirTitulo('');
    await waitFor(() => expect(screen.getByText(/corrige los campos marcados para guardar/i)).toBeInTheDocument());
    await escribirTitulo('Ya corregido');
    await abrirHistorial();
    await userEvent.click(botonRestaurar('Versión buena'));
    await confirmar();
    await within(dialogo()).findByText(/versión restaurada/i);
    expect(screen.queryByText(/corrige los campos marcados para guardar/i)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Propiedades: Encabezado' })).toBeInTheDocument();
  });

  it('si la página tiene campos con errores no restaura y lo explica', async () => {
    await guardada('Versión buena');
    await abrir();
    await escribirTitulo('');
    await waitFor(() => expect(screen.getByText(/corrige los campos marcados para guardar/i)).toBeInTheDocument());
    await abrirHistorial();
    await userEvent.click(botonRestaurar('Versión buena'));
    await confirmar();
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent('Corrige los campos marcados de la página antes de restaurar: lo que tienes ahora se guarda para poder deshacer.');
    expect(historyService.restoreVersion).not.toHaveBeenCalled();
  });

  it('si la versión ya no existe lo dice y vuelve a pedir la lista', async () => {
    await conVersionBuena();
    const llamadas = vi.mocked(historyService.listHistory).mock.calls.length;
    vi.mocked(historyService.restoreVersion).mockRejectedValueOnce(new ApiError(404, 'HISTORY_NOT_FOUND', 'Versión no encontrada'));
    await userEvent.click(botonRestaurar('Versión buena'));
    await confirmar();
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent('Esa versión ya no existe.');
    await waitFor(() => expect(vi.mocked(historyService.listHistory).mock.calls.length).toBe(llamadas + 1));
    expect(tituloEnLienzo()).toBe('Un título que ya no quiero');
  });

  it.each([
    [new ApiError(403, 'FORBIDDEN', 'No permitido'), 'No tienes permiso para restaurar versiones.'],
    [new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'), 'No se pudo restaurar. Inténtalo de nuevo.'],
  ])('un error (%o) se explica y se puede volver a intentar', async (error, mensaje) => {
    await conVersionBuena();
    vi.mocked(historyService.restoreVersion).mockRejectedValueOnce(error);
    await userEvent.click(botonRestaurar('Versión buena'));
    await confirmar();
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent(mensaje);
    expect(tituloEnLienzo()).toBe('Un título que ya no quiero');
    await userEvent.click(botonRestaurar('Versión buena'));
    await confirmar();
    await within(dialogo()).findByText(/versión restaurada/i);
    expect(tituloEnLienzo()).toBe(ORIGINAL);
  });

  it('mientras restaura no se puede cerrar ni confirmar otra vez', async () => {
    await conVersionBuena();
    vi.mocked(historyService.restoreVersion).mockImplementationOnce(() => new Promise(() => undefined));
    await userEvent.click(botonRestaurar('Versión buena'));
    await confirmar();
    const restaurando = await within(dialogo()).findByRole('button', { name: 'Restaurando…' });
    expect(restaurando).toBeDisabled();
    expect(within(dialogo()).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    // El foco sale del diálogo al deshabilitarse el botón: Escape se manda directamente a él.
    fireEvent.keyDown(dialogo(), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(historyService.restoreVersion).toHaveBeenCalledTimes(1);
  });
});

describe('quién puede hacer qué', () => {
  it('el diseñador guarda versiones pero no ve el botón de restaurar', async () => {
    await guardada('Versión de otra persona');
    editarBaseDeDemostracion((db) => {
      db.workspaces[0].role = 'disenador';
    });
    await abrir();
    await abrirHistorial();
    expect(etiquetas()).toEqual(['Versión de otra persona']);
    expect(within(dialogo()).queryByRole('button', { name: /^Restaurar/ })).not.toBeInTheDocument();
    await userEvent.type(within(dialogo()).getByLabelText('Nombre de la versión'), 'Mi versión');
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Guardar versión' }));
    expect(await within(dialogo()).findByText('Versión guardada.')).toBeInTheDocument();
    expect(etiquetas()).toEqual(['Mi versión', 'Versión de otra persona']);
  });

  it.each(['super_admin', 'client_admin', 'marketing_manager'])('el rol %s sí puede restaurar', async (rol) => {
    await guardada('Una versión');
    editarBaseDeDemostracion((db) => {
      db.workspaces[0].role = rol;
    });
    await abrir();
    await abrirHistorial();
    expect(botonRestaurar('Una versión')).toBeInTheDocument();
  });
});
