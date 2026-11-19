import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api';
import * as funnelsService from '@/services/funnels';
import { getFunnel, publishFunnel, type Funnel } from '@/services/funnels';
import { listHistory } from '@/services/history';
import { seedFunnel, startDemo } from './helpers/demoApp';
import { montar } from './helpers/renderApp';

vi.mock('@/features/editor/constants', () => ({ AUTOSAVE_DELAY_MS: 25 }));
vi.mock('@/services/funnels', async (importOriginal) => {
  const original = await importOriginal<typeof funnelsService>();
  return { ...original, regenerateBlock: vi.fn(original.regenerateBlock), generateFunnelPage: vi.fn(original.generateFunnelPage) };
});

const TITULO = 'Ahorra 5 horas a la semana';
let ctx: Awaited<ReturnType<typeof startDemo>>;
let funnel: Funnel;

beforeEach(async () => {
  vi.mocked(funnelsService.regenerateBlock).mockClear();
  vi.mocked(funnelsService.generateFunnelPage).mockClear();
  ctx = await startDemo();
  const creado = await seedFunnel(ctx.token, ctx.workspace, { name: 'Curso de Excel', brief: { result: TITULO, offer: 'Un curso en línea' } });
  funnel = await getFunnel(ctx.token, creado.id);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const lienzo = () => screen.getByRole('article', { name: 'Página' });
const tituloEnLienzo = () => within(lienzo()).getByRole('heading', { level: 1 }).textContent;
const persistido = () => getFunnel(ctx.token, funnel.id);
const asistente = () => screen.getByRole('region', { name: 'Reescribir con IA' });
const propuesta = () => screen.getByRole('region', { name: 'Propuesta de la IA' });

async function abrir() {
  montar(`/funnels/${funnel.id}/editor`);
  await screen.findByRole('navigation', { name: /bloques de la página/i });
}
/** Elige un bloque en la lista de la izquierda. */
async function elegir(nombre: RegExp) {
  const lista = screen.getByRole('navigation', { name: /bloques de la página/i });
  await userEvent.click(within(lista).getByRole('button', { name: nombre }));
}
const pedirPropuesta = async () => userEvent.click(within(asistente()).getByRole('button', { name: 'Reescribir con IA' }));

describe('reescribir un bloque con IA', () => {
  it('el panel del bloque ofrece «Reescribir con IA»; la IA propone un texto y NO se guarda hasta que la persona lo usa', async () => {
    await abrir();
    expect(tituloEnLienzo()).toBe(TITULO);
    await pedirPropuesta();
    const caja = await screen.findByRole('region', { name: 'Propuesta de la IA' });
    expect(within(caja).getByText(`${TITULO} (IA)`)).toBeInTheDocument();
    // Todavía no cambió nada, ni en pantalla ni en el servidor.
    expect(tituloEnLienzo()).toBe(TITULO);
    expect((await persistido()).content.blocks[0]?.content.title).toBe(TITULO);
  });

  it('«Usar esta propuesta» pone el texto en el bloque y se autoguarda', async () => {
    await abrir();
    await pedirPropuesta();
    await userEvent.click(within(await screen.findByRole('region', { name: 'Propuesta de la IA' })).getByRole('button', { name: 'Usar esta propuesta' }));
    expect(tituloEnLienzo()).toBe(`${TITULO} (IA)`);
    expect(screen.queryByRole('region', { name: 'Propuesta de la IA' })).not.toBeInTheDocument();
    await waitFor(async () => expect((await persistido()).content.blocks[0]?.content.title).toBe(`${TITULO} (IA)`));
  });

  it('«Descartar» quita la propuesta sin cambiar nada', async () => {
    await abrir();
    await pedirPropuesta();
    await userEvent.click(within(await screen.findByRole('region', { name: 'Propuesta de la IA' })).getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByRole('region', { name: 'Propuesta de la IA' })).not.toBeInTheDocument();
    expect(tituloEnLienzo()).toBe(TITULO);
    expect(within(asistente()).getByRole('button', { name: 'Reescribir con IA' })).toBeInTheDocument();
  });

  it('«Pedir otra» vuelve a pedir una propuesta', async () => {
    await abrir();
    await pedirPropuesta();
    await userEvent.click(within(await screen.findByRole('region', { name: 'Propuesta de la IA' })).getByRole('button', { name: 'Pedir otra' }));
    await waitFor(() => expect(funnelsService.regenerateBlock).toHaveBeenCalledTimes(2));
  });

  it('manda al servidor la indicación que escribió la persona (sin espacios sobrantes) y el bloque que está eligiendo', async () => {
    await abrir();
    await userEvent.type(within(asistente()).getByLabelText(/qué quieres cambiar/i), '  más corto  ');
    await pedirPropuesta();
    await screen.findByRole('region', { name: 'Propuesta de la IA' });
    expect(funnelsService.regenerateBlock).toHaveBeenCalledWith(ctx.token, funnel.id, 'encabezado', { instruction: 'más corto' });
  });

  it('sin indicación no manda el campo', async () => {
    await abrir();
    await pedirPropuesta();
    await screen.findByRole('region', { name: 'Propuesta de la IA' });
    expect(funnelsService.regenerateBlock).toHaveBeenCalledWith(ctx.token, funnel.id, 'encabezado', {});
  });

  it('mientras la IA escribe lo avisa y no deja pedir dos veces', async () => {
    await abrir();
    let soltar: (value: funnelsService.BlockProposal) => void = () => undefined;
    vi.mocked(funnelsService.regenerateBlock).mockImplementationOnce(() => new Promise((resolver) => (soltar = resolver)));
    await pedirPropuesta();
    expect(await within(asistente()).findByRole('button', { name: 'Escribiendo…' })).toBeDisabled();
    soltar({ key: 'encabezado', type: 'encabezado', content: { title: 'Titular nuevo' } });
    expect(await screen.findByRole('region', { name: 'Propuesta de la IA' })).toHaveTextContent('Titular nuevo');
    expect(funnelsService.regenerateBlock).toHaveBeenCalledTimes(1);
  });

  it('lo que la persona acaba de escribir se guarda ANTES de pedir la propuesta, para que la IA parta de eso', async () => {
    await abrir();
    const campos = screen.getByRole('region', { name: 'Propiedades: Encabezado' });
    fireEvent.change(within(campos).getByLabelText('Título'), { target: { value: 'Mi titular escrito a mano' } });
    await pedirPropuesta();
    expect(await screen.findByRole('region', { name: 'Propuesta de la IA' })).toHaveTextContent('Mi titular escrito a mano (IA)');
  });

  it('con un campo con errores no pide nada y explica por qué', async () => {
    await abrir();
    const campos = screen.getByRole('region', { name: 'Propiedades: Encabezado' });
    fireEvent.change(within(campos).getByLabelText('Título'), { target: { value: '' } });
    await pedirPropuesta();
    expect(await within(asistente()).findByRole('alert')).toHaveTextContent(/corrige los campos marcados/i);
    expect(funnelsService.regenerateBlock).not.toHaveBeenCalled();
  });

  it.each([
    ['AI_NOT_CONFIGURED', 503, 'La IA no está disponible por ahora.'],
    ['AI_UNAVAILABLE', 503, 'La IA no respondió. Intenta de nuevo en un momento.'],
    ['AI_BAD_RESPONSE', 503, 'La IA no devolvió algo que se pueda usar. Intenta de nuevo.'],
    ['AI_RATE_LIMITED', 429, 'Se alcanzó el límite de usos de la IA de este negocio. Intenta más tarde.'],
    ['AI_QUOTA_EXCEEDED', 429, 'Se agotó la cuota de la IA. Intenta más tarde.'],
  ])('si el servidor responde %s lo explica con claridad y se puede reintentar', async (code, status, texto) => {
    await abrir();
    vi.mocked(funnelsService.regenerateBlock).mockRejectedValueOnce(new ApiError(status, code, 'detalle técnico'));
    await pedirPropuesta();
    expect(await within(asistente()).findByRole('alert')).toHaveTextContent(texto);
    expect(within(asistente()).queryByText('detalle técnico')).not.toBeInTheDocument();
    expect(within(asistente()).getByRole('button', { name: 'Reescribir con IA' })).toBeEnabled();
  });

  it('en los bloques que la IA no debe inventar (testimonios) no se ofrece', async () => {
    await abrir();
    await elegir(/testimonios/i);
    expect(screen.queryByRole('region', { name: 'Reescribir con IA' })).not.toBeInTheDocument();
    await elegir(/preguntas frecuentes/i);
    expect(screen.getByRole('region', { name: 'Reescribir con IA' })).toBeInTheDocument();
  });

  it('cambiar de bloque descarta la propuesta que estaba abierta', async () => {
    await abrir();
    await pedirPropuesta();
    await screen.findByRole('region', { name: 'Propuesta de la IA' });
    await elegir(/beneficios/i);
    expect(screen.queryByRole('region', { name: 'Propuesta de la IA' })).not.toBeInTheDocument();
  });
});

describe('volver a generar la página con IA', () => {
  const abrirDialogo = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Volver a generar con IA' }));
    return screen.findByRole('dialog', { name: 'Volver a generar con IA' });
  };

  it('un botón en la barra abre el diálogo, que explica que se guarda una versión y se conservan plantilla y colores, y se cierra con Cancelar', async () => {
    await abrir();
    const dialogo = await abrirDialogo();
    expect(dialogo).toHaveTextContent(/se conservan tu plantilla, tus colores y tus tipografías/i);
    expect(dialogo).toHaveTextContent(/antes se guarda una versión/i);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(funnelsService.generateFunnelPage).not.toHaveBeenCalled();
  });

  it('genera de nuevo: la página cambia, queda una versión del estado anterior, y se conservan la plantilla y los colores', async () => {
    await abrir();
    const diseno = funnel.designSpec;
    const dialogo = await abrirDialogo();
    await userEvent.type(within(dialogo).getByLabelText(/qué quieres que cambie/i), 'enfocado en emprendedores');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Generar de nuevo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(funnelsService.generateFunnelPage).toHaveBeenCalledWith(ctx.token, funnel.id, { instruction: 'enfocado en emprendedores' });
    expect(tituloEnLienzo()).toBe(`${TITULO} (IA)`);
    const nuevo = await persistido();
    expect(nuevo.content.blocks[0]?.content.title).toBe(`${TITULO} (IA)`);
    expect(nuevo.designSpec).toEqual(diseno);

    const versiones = await listHistory(ctx.token, funnel.id);
    expect(versiones.map((v) => v.label)).toContain('Antes de volver a generar con IA');
  });

  it('lo que la persona tenía pendiente se guarda antes de generar (y entra en la versión de respaldo)', async () => {
    await abrir();
    fireEvent.change(within(screen.getByRole('region', { name: 'Propiedades: Encabezado' })).getByLabelText('Título'), { target: { value: 'Escrito a mano' } });
    const dialogo = await abrirDialogo();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Generar de nuevo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(tituloEnLienzo()).toBe('Escrito a mano (IA)');
  });

  it('una propuesta de bloque que estaba abierta se descarta al volver a generar la página (ya no corresponde)', async () => {
    await abrir();
    await pedirPropuesta();
    await screen.findByRole('region', { name: 'Propuesta de la IA' });
    const dialogo = await abrirDialogo();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Generar de nuevo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Propuesta de la IA' })).not.toBeInTheDocument();
  });

  it('con campos con errores no genera y explica por qué', async () => {
    await abrir();
    fireEvent.change(within(screen.getByRole('region', { name: 'Propiedades: Encabezado' })).getByLabelText('Título'), { target: { value: '' } });
    const dialogo = await abrirDialogo();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Generar de nuevo' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/corrige los campos marcados/i);
    expect(funnelsService.generateFunnelPage).not.toHaveBeenCalled();
  });

  it('si la IA falla lo explica, deja el diálogo abierto y la página como estaba', async () => {
    await abrir();
    vi.mocked(funnelsService.generateFunnelPage).mockRejectedValueOnce(new ApiError(503, 'AI_UNAVAILABLE', 'caído'));
    const dialogo = await abrirDialogo();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Generar de nuevo' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('La IA no respondió. Intenta de nuevo en un momento.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(tituloEnLienzo()).toBe(TITULO);
  });

  it('mientras genera lo avisa y el diálogo no se cierra solo', async () => {
    await abrir();
    let soltar: (value: Funnel) => void = () => undefined;
    vi.mocked(funnelsService.generateFunnelPage).mockImplementationOnce(() => new Promise((resolver) => (soltar = resolver)));
    const dialogo = await abrirDialogo();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Generar de nuevo' }));
    expect(await within(dialogo).findByRole('button', { name: 'Generando…' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    soltar(await persistido());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('con la página publicada el botón está desactivado y explica que hay que despublicar', async () => {
    await publishFunnel(ctx.token, funnel.id);
    await abrir();
    const boton = screen.getByRole('button', { name: 'Volver a generar con IA' });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('title', expect.stringMatching(/despublica el funnel/i));
  });
});
