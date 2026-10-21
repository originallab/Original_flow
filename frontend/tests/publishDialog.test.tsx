import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorTopBar } from '@/features/editor/components/EditorTopBar';
import { ApiError } from '@/services/api';
import * as funnelsService from '@/services/funnels';
import { getFunnel, publishFunnel, unpublishFunnel, type Funnel, type FunnelObjective } from '@/services/funnels';
import { Modal } from '@/shared/ui/Modal';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';
import { publicUrl } from '@/shared/utils/publicUrl';
import { BLOCKS } from '@/shared/blocks/catalog';
import { block, seedFunnel, startDemo } from './helpers/demoApp';
import { montar } from './helpers/renderApp';

const retraso = vi.hoisted(() => ({ ms: 25 }));
vi.mock('@/features/editor/constants', () => ({
  get AUTOSAVE_DELAY_MS() {
    return retraso.ms;
  },
}));
vi.mock('@/services/funnels', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/funnels')>();
  return { ...original, saveContent: vi.fn(original.saveContent), getFunnel: vi.fn(original.getFunnel), publishFunnel: vi.fn(original.publishFunnel), unpublishFunnel: vi.fn(original.unpublishFunnel) };
});

let ctx: Awaited<ReturnType<typeof startDemo>>;
beforeEach(async () => {
  retraso.ms = 25;
  for (const fn of [funnelsService.saveContent, funnelsService.getFunnel, funnelsService.publishFunnel, funnelsService.unpublishFunnel]) vi.mocked(fn).mockReset();
  ctx = await startDemo();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const BOTON_PUBLICAR = { name: 'Publicar' } as const;
const dialogo = () => screen.getByRole('dialog');
const requisito = (code: string) => within(dialogo()).getByRole('list', { name: /requisitos para publicar/i }).querySelector(`[data-requirement="${code}"]`) as HTMLElement;
const estado = (code: string) => requisito(code).getAttribute('data-state');
const lista = () => screen.getByRole('navigation', { name: /bloques de la página/i });
const persistido = (f: Funnel) => getFunnel(ctx.token, f.id);
const limpiarLlamadas = () => {
  for (const fn of [funnelsService.saveContent, funnelsService.getFunnel, funnelsService.publishFunnel, funnelsService.unpublishFunnel]) vi.mocked(fn).mockClear();
};

async function crear(objective: FunnelObjective, extra: Parameters<typeof seedFunnel>[2] = {}) {
  const funnel = await seedFunnel(ctx.token, ctx.workspace, { name: `Funnel ${objective}`, objective, ...extra });
  limpiarLlamadas();
  return funnel;
}
async function abrir(f: Funnel) {
  const vista = montar(`/funnels/${f.id}/editor`);
  await screen.findByRole('navigation', { name: /bloques de la página/i });
  return vista;
}
async function abrirDialogo(f: Funnel) {
  const vista = await abrir(f);
  await userEvent.click(screen.getByRole('button', BOTON_PUBLICAR));
  await screen.findByRole('dialog');
  return vista;
}
const esperarRevision = () => within(dialogo()).findByRole('list', { name: /requisitos para publicar/i });

describe('la barra del editor', () => {
  it('muestra «Borrador» y el botón «Publicar»; ya publicado, «Publicado»', async () => {
    const f = await crear('leads');
    await abrir(f);
    expect(within(screen.getByRole('banner')).getByText('Borrador')).toBeInTheDocument();
    expect(screen.getByRole('button', BOTON_PUBLICAR)).toBeEnabled();
    await userEvent.click(screen.getByRole('button', BOTON_PUBLICAR));
    await esperarRevision();
    await userEvent.click(within(dialogo()).getByRole('button', { name: /publicar ahora/i }));
    await within(dialogo()).findByText(/cualquier cambio que hagas/i);
    expect(within(screen.getByRole('banner')).getAllByText('Publicado')).toHaveLength(2); // la etiqueta del nombre y el texto del botón
    expect(screen.getByRole('button', { name: /publicado: ver o despublicar/i })).toBeInTheDocument();
  });

  it('quien no puede publicar (por ejemplo, un diseñador) ve el botón deshabilitado y con la explicación', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <EditorTopBar name="Mi funnel" templateName="Claridad" status="saved" preview={false} onTogglePreview={() => undefined} onRetry={() => undefined} published={false} canPublish={false} onPublish={() => undefined} />
        </ThemeProvider>
      </MemoryRouter>,
    );
    const boton = screen.getByRole('button', BOTON_PUBLICAR);
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('title', expect.stringMatching(/administra el negocio o hace marketing/i));
  });

  it('en la pantalla del editor, el rol de la persona en ese negocio decide si puede publicar', async () => {
    const f = await crear('leads');
    const cambiarRol = (rol: string) => {
      const db = JSON.parse(localStorage.getItem('of-demo-db')!) as { workspaces: { role: string }[] };
      db.workspaces[0]!.role = rol;
      localStorage.setItem('of-demo-db', JSON.stringify(db));
    };
    cambiarRol('disenador');
    const vista = await abrir(f);
    expect(screen.getByRole('button', BOTON_PUBLICAR)).toBeDisabled();
    vista.unmount();

    cambiarRol('marketing_manager');
    await abrir(f);
    expect(screen.getByRole('button', BOTON_PUBLICAR)).toBeEnabled();
  });

  it('el botón de publicar avisa por su cuenta qué hace según el estado', () => {
    const barra = (published: boolean) => (
      <MemoryRouter>
        <ThemeProvider>
          <EditorTopBar name="Mi funnel" templateName="Claridad" status="saved" preview={false} onTogglePreview={() => undefined} onRetry={() => undefined} published={published} canPublish onPublish={() => undefined} />
        </ThemeProvider>
      </MemoryRouter>
    );
    const { unmount } = render(barra(false));
    expect(screen.getByRole('button', BOTON_PUBLICAR)).toBeEnabled();
    unmount();
    render(barra(true));
    expect(screen.getAllByText('Publicado')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /publicado: ver o despublicar/i })).toBeEnabled();
  });
});

describe('publicar: la lista de requisitos', () => {
  it('un funnel de captar leads completo: todo cumplido y se puede publicar', async () => {
    const f = await crear('leads');
    await abrirDialogo(f);
    await esperarRevision();
    expect(within(dialogo()).getAllByRole('listitem').map((li) => li.getAttribute('data-requirement'))).toEqual(['CONTENT_EMPTY', 'TYPE_CONFIG_INCOMPLETE', 'FORM_MISSING', 'CTA_DESTINATION_MISSING']);
    for (const code of ['CONTENT_EMPTY', 'TYPE_CONFIG_INCOMPLETE', 'FORM_MISSING', 'CTA_DESTINATION_MISSING']) expect(estado(code), code).toBe('done');
    expect(within(dialogo()).getByRole('button', { name: /publicar ahora/i })).toBeEnabled();
  });

  it('un funnel que cobra suma el botón de pago, el precio y Original Pay', async () => {
    const f = await crear('venta', { price: 1490 });
    await abrirDialogo(f);
    await esperarRevision();
    expect(within(dialogo()).getAllByRole('listitem').map((li) => li.getAttribute('data-requirement'))).toEqual(['CONTENT_EMPTY', 'TYPE_CONFIG_INCOMPLETE', 'CHECKOUT_BUTTON_MISSING', 'PRICE_MISSING', 'PAYMENTS_NOT_CONNECTED', 'CTA_DESTINATION_MISSING']);
    expect(estado('PRICE_MISSING')).toBe('done');
    expect(estado('CHECKOUT_BUTTON_MISSING')).toBe('done');
    expect(estado('PAYMENTS_NOT_CONNECTED')).toBe('unknown');
    expect(within(requisito('PAYMENTS_NOT_CONNECTED')).getByText(/se comprueba al publicar/i)).toBeInTheDocument();
  });

  it('antes de revisar guarda lo pendiente de la página (y muestra «Revisando…»)', async () => {
    retraso.ms = 60_000; // solo el guardado al abrir esta ventana puede guardar el cambio
    const f = await crear('leads');
    await abrir(f);
    await userEvent.type(screen.getByLabelText('Título', { exact: true }), ' nuevo');
    expect(vi.mocked(funnelsService.saveContent)).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', BOTON_PUBLICAR));
    await esperarRevision();
    expect(vi.mocked(funnelsService.saveContent)).toHaveBeenCalledTimes(1);
    expect((await persistido(f)).content.blocks[0]?.content.title).toMatch(/ nuevo$/);
  });

  it('si la página tiene campos con errores no deja publicar y lo explica', async () => {
    const f = await crear('leads');
    await abrir(f);
    await userEvent.clear(screen.getByLabelText('Título', { exact: true }));
    await userEvent.click(screen.getByRole('button', BOTON_PUBLICAR));
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent(/cambios en la página que no se pudieron guardar/i);
    expect(within(dialogo()).queryByRole('button', { name: /publicar ahora/i })).not.toBeInTheDocument();
    expect(publishFunnel).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo()).getAllByRole('button', { name: 'Cerrar' }).at(-1)!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('faltan los ajustes del tipo: lo marca con lo que falta y «Ir a ajustes» abre esa sección', async () => {
    const f = await crear('citas');
    await abrirDialogo(f);
    await esperarRevision();
    expect(estado('TYPE_CONFIG_INCOMPLETE')).toBe('pending');
    expect(within(requisito('TYPE_CONFIG_INCOMPLETE')).getByText(/faltan ajustes del tipo de funnel: calendarUrl/i)).toBeInTheDocument();
    expect(within(dialogo()).getByRole('button', { name: /publicar ahora/i })).toBeDisabled();
    await userEvent.click(within(requisito('TYPE_CONFIG_INCOMPLETE')).getByRole('button', { name: /ir a ajustes/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Ajustes/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Ajustes del funnel' })).toBeVisible();
  });

  it('una venta sin precio: «Ir a ajustes» lleva a los datos', async () => {
    const f = await crear('venta');
    await abrirDialogo(f);
    await esperarRevision();
    expect(estado('PRICE_MISSING')).toBe('pending');
    await userEvent.click(within(requisito('PRICE_MISSING')).getByRole('button', { name: /ir a ajustes/i }));
    expect(screen.getByRole('region', { name: 'Datos del funnel' })).toBeVisible();
    expect(screen.getByLabelText('Precio')).toBeVisible();
  });

  it('una página vacía: «Agregar un bloque» pone uno y cierra la ventana', async () => {
    const f = await crear('leads', { blocks: [] });
    await abrirDialogo(f);
    await esperarRevision();
    expect(estado('CONTENT_EMPTY')).toBe('pending');
    expect(estado('FORM_MISSING')).toBe('pending');
    await userEvent.click(within(requisito('CONTENT_EMPTY')).getByRole('button', { name: /agregar un bloque/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(lista()).getAllByRole('listitem')).toHaveLength(1);
  });

  it('sin formulario: «Agregar formulario» lo agrega después del bloque elegido', async () => {
    const f = await crear('leads', { blocks: [block('encabezado', 'encabezado', BLOCKS.encabezado.create()), block('texto', 'texto', BLOCKS.texto.create(), 2)] });
    await abrirDialogo(f);
    await esperarRevision();
    expect(estado('FORM_MISSING')).toBe('pending');
    await userEvent.click(within(requisito('FORM_MISSING')).getByRole('button', { name: /agregar formulario/i }));
    const nombres = within(lista()).getAllByRole('listitem').map((li) => within(li).getAllByRole('button')[0]!.textContent);
    expect(nombres[1]).toMatch(/^Formulario/);
  });

  it('sin botón de pago en una venta: «Agregar botón» agrega un botón', async () => {
    const f = await crear('venta', { price: 100, blocks: [block('encabezado', 'encabezado', BLOCKS.encabezado.create())] });
    await abrirDialogo(f);
    await esperarRevision();
    expect(estado('CHECKOUT_BUTTON_MISSING')).toBe('pending');
    await userEvent.click(within(requisito('CHECKOUT_BUTTON_MISSING')).getByRole('button', { name: /agregar botón/i }));
    expect(within(lista()).getByRole('button', { name: /^Botón/ })).toBeInTheDocument();
  });

  it('un botón con enlace sin destino lo marca por su nombre', async () => {
    const f = await crear('leads', { blocks: [block('encabezado', 'encabezado', BLOCKS.encabezado.create()), block('boton', 'boton', { label: 'Ir' }, 2), block('formulario', 'formulario', BLOCKS.formulario.create(), 3)] });
    await funnelsService.updateCta(ctx.token, f.id, 'boton', { actionType: 'url' });
    await abrirDialogo(f);
    await esperarRevision();
    expect(estado('CTA_DESTINATION_MISSING')).toBe('pending');
    expect(within(requisito('CTA_DESTINATION_MISSING')).getByText('El botón "boton" no tiene destino')).toBeInTheDocument();
    await userEvent.click(within(requisito('CTA_DESTINATION_MISSING')).getByRole('button', { name: /ir a ajustes/i }));
    expect(screen.getByRole('region', { name: 'Botones y formularios' })).toBeVisible();
  });

  it('avisa si hay ajustes escritos que todavía no se guardan', async () => {
    const f = await crear('leads');
    await abrir(f);
    await userEvent.click(screen.getByRole('tab', { name: /^Ajustes/ }));
    await userEvent.type(await screen.findByLabelText('Nombre del funnel'), '!');
    await userEvent.click(screen.getByRole('button', BOTON_PUBLICAR));
    await esperarRevision();
    expect(within(dialogo()).getByRole('note')).toHaveTextContent(/ajustes sin guardar/i);
  });

  it('si no se puede revisar avisa y deja reintentar', async () => {
    const f = await crear('leads');
    await abrir(f);
    vi.mocked(getFunnel).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    await userEvent.click(screen.getByRole('button', BOTON_PUBLICAR));
    expect(await within(await screen.findByRole('dialog')).findByRole('alert')).toHaveTextContent(/no se pudo revisar el funnel/i);
    await userEvent.click(within(dialogo()).getByRole('button', { name: /reintentar/i }));
    await esperarRevision();
  });
});

describe('publicar y despublicar', () => {
  it('publica, muestra la dirección de la página y deja el funnel publicado', async () => {
    const f = await crear('leads');
    await abrirDialogo(f);
    await esperarRevision();
    await userEvent.click(within(dialogo()).getByRole('button', { name: /publicar ahora/i }));
    expect(await screen.findByRole('dialog', { name: 'Tu funnel está publicado' })).toBeInTheDocument();
    expect(within(dialogo()).getByLabelText('Dirección de tu página')).toHaveValue(publicUrl(f.slug));
    const abrirPagina = within(dialogo()).getByRole('link', { name: /abrir la página/i });
    expect(abrirPagina).toHaveAttribute('href', publicUrl(f.slug));
    expect(abrirPagina).toHaveAttribute('target', '_blank');
    expect((await persistido(f)).status).toBe('published');
  });

  it('copiar el enlace usa el portapapeles y lo confirma', async () => {
    const f = await crear('leads');
    const escribir = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escribir }, configurable: true });
    await abrirDialogo(f);
    await esperarRevision();
    await userEvent.click(within(dialogo()).getByRole('button', { name: /publicar ahora/i }));
    await userEvent.click(await within(dialogo()).findByRole('button', { name: /copiar enlace/i }));
    expect(escribir).toHaveBeenCalledWith(publicUrl(f.slug));
    expect(await within(dialogo()).findByRole('button', { name: /copiado/i })).toBeInTheDocument();
  });

  it('si no se puede copiar lo avisa', async () => {
    const f = await crear('leads');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true });
    await abrirDialogo(f);
    await esperarRevision();
    await userEvent.click(within(dialogo()).getByRole('button', { name: /publicar ahora/i }));
    await userEvent.click(await within(dialogo()).findByRole('button', { name: /copiar enlace/i }));
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent(/no se pudo copiar/i);
  });

  it('un funnel ya publicado abre directo la vista de publicado, sin lista de requisitos', async () => {
    const f = await crear('leads');
    await publishFunnel(ctx.token, f.id);
    limpiarLlamadas();
    await abrir(f);
    await userEvent.click(screen.getByRole('button', { name: /publicado: ver o despublicar/i }));
    expect(await screen.findByRole('dialog', { name: 'Tu funnel está publicado' })).toBeInTheDocument();
    expect(within(dialogo()).queryByRole('list', { name: /requisitos/i })).not.toBeInTheDocument();
  });

  it('despublicar pide confirmar; si se confirma vuelve a borrador sin borrar nada', async () => {
    const f = await crear('leads');
    await publishFunnel(ctx.token, f.id);
    await abrir(f);
    await userEvent.click(screen.getByRole('button', { name: /publicado: ver o despublicar/i }));
    await screen.findByRole('dialog', { name: 'Tu funnel está publicado' });
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Despublicar' }));
    expect(within(dialogo()).getByText(/dejará de verse de inmediato/i)).toBeInTheDocument();
    await userEvent.click(within(dialogo()).getByRole('button', { name: /cancelar/i }));
    expect(within(dialogo()).queryByText(/dejará de verse/i)).not.toBeInTheDocument();
    expect(unpublishFunnel).not.toHaveBeenCalled();

    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Despublicar' }));
    await userEvent.click(within(dialogo()).getByRole('button', { name: /sí, despublicar/i }));
    await screen.findByRole('dialog', { name: 'Publicar tu funnel' });
    expect(within(screen.getByRole('banner')).getByText('Borrador')).toBeInTheDocument();
    const guardado = await persistido(f);
    expect(guardado.status).toBe('draft');
    expect(guardado.content.blocks.length).toBeGreaterThan(0);
  });

  it('si el servidor dice que todavía falta algo (por ejemplo Original Pay), lo muestra y no publica', async () => {
    const f = await crear('venta', { price: 1490 });
    await abrirDialogo(f);
    await esperarRevision();
    expect(within(dialogo()).getByRole('button', { name: /publicar ahora/i })).toBeEnabled();
    await userEvent.click(within(dialogo()).getByRole('button', { name: /publicar ahora/i }));
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent(/requisitos pendientes/i);
    expect(estado('PAYMENTS_NOT_CONNECTED')).toBe('pending');
    expect(within(requisito('PAYMENTS_NOT_CONNECTED')).getByText('El workspace no tiene Original Pay conectado')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Publicar tu funnel' })).toBeInTheDocument();
    expect((await persistido(f)).status).toBe('draft');
    expect(within(screen.getByRole('banner')).getByText('Borrador')).toBeInTheDocument();
  });

  it('un error de conexión al publicar avisa y deja intentar otra vez', async () => {
    const f = await crear('leads');
    await abrirDialogo(f);
    await esperarRevision();
    vi.mocked(publishFunnel).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor.'));
    await userEvent.click(within(dialogo()).getByRole('button', { name: /publicar ahora/i }));
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent(/no se pudo conectar/i);
    await userEvent.click(within(dialogo()).getByRole('button', { name: /publicar ahora/i }));
    expect(await screen.findByRole('dialog', { name: 'Tu funnel está publicado' })).toBeInTheDocument();
  });

  it('mientras publica no se puede cerrar la ventana', async () => {
    const f = await crear('leads');
    await abrirDialogo(f);
    await esperarRevision();
    vi.mocked(publishFunnel).mockImplementationOnce(() => new Promise(() => undefined));
    await userEvent.click(within(dialogo()).getByRole('button', { name: /publicar ahora/i }));
    expect(await within(dialogo()).findByRole('button', { name: /publicando/i })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialogo()).getByRole('button', { name: 'Cerrar' })).toBeDisabled();
  });
});

describe('la ventana (Modal)', () => {
  it('es un diálogo accesible con su título, se cierra con Escape y devuelve el foco al botón que la abrió', async () => {
    const f = await crear('leads');
    await abrir(f);
    const boton = screen.getByRole('button', BOTON_PUBLICAR);
    await userEvent.click(boton);
    const ventana = await screen.findByRole('dialog', { name: 'Publicar tu funnel' });
    expect(ventana).toHaveAttribute('aria-modal', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });

  it('se cierra con un clic en el fondo y con la «X», pero no con un clic dentro', async () => {
    const f = await crear('leads');
    await abrir(f);
    await userEvent.click(screen.getByRole('button', BOTON_PUBLICAR));
    const ventana = await screen.findByRole('dialog');
    await esperarRevision();
    fireEvent.mouseDown(ventana);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(ventana.parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', BOTON_PUBLICAR));
    await screen.findByRole('dialog');
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el teclado se queda dentro de la ventana (Tab y Mayús+Tab dan la vuelta)', async () => {
    const alCerrar = vi.fn();
    render(
      <Modal title="Prueba" onClose={alCerrar}>
        <button>Primero</button>
        <button>Último</button>
      </Modal>,
    );
    const cerrar = screen.getByRole('button', { name: 'Cerrar' });
    const ultimo = screen.getByRole('button', { name: 'Último' });
    ultimo.focus();
    await userEvent.tab();
    expect(cerrar).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(ultimo).toHaveFocus();
  });
});

describe('permisos y direcciones que no existen', () => {
  it('un funnel que la persona no puede abrir (403) dice que no tiene permiso', async () => {
    const f = await crear('leads');
    vi.mocked(getFunnel).mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'No tienes permiso'));
    montar(`/funnels/${f.id}/editor`);
    expect(await screen.findByRole('heading', { name: /no tienes permiso para editar este funnel/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver a mis funnels/i })).toBeInTheDocument();
  });

  it('cualquier dirección que no existe muestra «Esta página no existe», también sin sesión', async () => {
    sessionStorage.clear();
    const { router } = montar('/esta/direccion/no-existe');
    expect(await screen.findByRole('heading', { name: /esta página no existe/i })).toBeInTheDocument();
    expect(screen.getByRole('banner').firstElementChild).toBe(screen.getByRole('img', { name: 'Original Flow' }));
    await userEvent.click(screen.getByRole('link', { name: /ir al inicio/i }));
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/esta/direccion/no-existe'));
  });
});
