import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunnel, type Funnel } from '@/services/funnels';
import { seedFunnel, startDemo } from './helpers/demoApp';
import { montar } from './helpers/renderApp';

vi.mock('@/features/editor/constants', () => ({ AUTOSAVE_DELAY_MS: 25 }));

let ctx: Awaited<ReturnType<typeof startDemo>>;
let funnel: Funnel;
beforeEach(async () => {
  ctx = await startDemo();
  funnel = await seedFunnel(ctx.token, ctx.workspace, { name: 'Curso de Excel', brief: { result: 'Ahorra 5 horas a la semana', offer: 'Un curso en línea' } });
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  document.head.querySelectorAll('link[data-page-fonts]').forEach((l) => l.remove());
});

const user = () => userEvent.setup({ delay: null });
const persistido = () => getFunnel(ctx.token, funnel.id);
const lienzo = () => screen.getByRole('article', { name: 'Página' });
const lista = () => screen.getByRole('navigation', { name: /bloques de la página/i });

async function abrir() {
  montar(`/funnels/${funnel.id}/editor`);
  await screen.findByRole('navigation', { name: /bloques de la página/i });
}

describe('diseño del bloque', () => {
  it('cada bloque ofrece su forma (si tiene varias) y su fondo, y el cambio se ve y se guarda', async () => {
    await abrir();
    const panel = screen.getByRole('region', { name: 'Propiedades: Encabezado' });
    const grupo = within(panel).getByRole('group', { name: 'Diseño del bloque' });
    await user().selectOptions(within(grupo).getByLabelText('Forma'), 'grande');
    await user().selectOptions(within(grupo).getByLabelText('Fondo'), 'dark');
    expect(within(lienzo()).getByRole('heading', { level: 1 }).className).toContain('text-7xl');
    await waitFor(async () => expect((await persistido()).content.blocks.find((b) => b.key === 'encabezado')?.style).toEqual({ variant: 'grande', background: 'dark' }));
  });

  it('volver a la forma y el fondo normales no deja nada en el estilo', async () => {
    await abrir();
    const grupo = within(screen.getByRole('region', { name: 'Propiedades: Encabezado' })).getByRole('group', { name: 'Diseño del bloque' });
    await user().selectOptions(within(grupo).getByLabelText('Fondo'), 'accent');
    await user().selectOptions(within(grupo).getByLabelText('Fondo'), 'base');
    // el encabezado de la página generada nace con forma «grande»: quitar el fondo deja solo la forma
    await waitFor(async () => expect((await persistido()).content.blocks.find((b) => b.key === 'encabezado')?.style).toEqual({ variant: 'grande' }));
  });

  it('un bloque sin variantes (formulario) solo ofrece el fondo', async () => {
    await abrir();
    await user().click(within(lista()).getByRole('button', { name: /^Formulario/ }));
    const grupo = within(screen.getByRole('region', { name: 'Propiedades: Formulario' })).getByRole('group', { name: 'Diseño del bloque' });
    expect(within(grupo).queryByLabelText('Forma')).toBeNull();
    expect(within(grupo).getByLabelText('Fondo')).toBeInTheDocument();
  });
});

describe('diseño de la página (Ajustes)', () => {
  const irAAjustes = () => user().click(screen.getByRole('tab', { name: /Ajustes/ }));

  it('muestra las tipografías de la plantilla y cambiarlas recarga las fuentes y se guarda', async () => {
    await abrir();
    await irAAjustes();
    expect(screen.getByLabelText('Tipografía de los títulos')).toHaveValue('Montserrat');
    await user().selectOptions(screen.getByLabelText('Tipografía de los títulos'), 'Playfair Display');
    await waitFor(async () => expect((await persistido()).designSpec?.fonts).toEqual({ heading: 'Playfair Display', body: 'Inter' }));
    await waitFor(() => expect(lienzo().style.getPropertyValue('--page-heading')).toContain('Playfair Display'));
    expect(document.head.querySelector('link[data-page-fonts][href*="Playfair+Display"]')).not.toBeNull();
  });

  it('el aspecto (esquinas, espacio, títulos) se guarda y quitarlo vuelve a la plantilla', async () => {
    await abrir();
    await irAAjustes();
    await user().selectOptions(screen.getByLabelText('Espacio entre secciones'), 'airy');
    await user().selectOptions(screen.getByLabelText('Títulos'), 'upper');
    await waitFor(async () => expect((await persistido()).designSpec?.look).toMatchObject({ density: 'airy', headingCase: 'upper' }));
    expect(within(lienzo()).getByRole('heading', { level: 1 })).toHaveStyle({ textTransform: 'uppercase' });
    await user().selectOptions(screen.getByLabelText('Títulos'), '');
    await user().selectOptions(screen.getByLabelText('Espacio entre secciones'), '');
    // quitar lo elegido vuelve al aspecto con el que nació la página
    await waitFor(async () => expect((await persistido()).designSpec?.look).toEqual({ surface: 'elevated', backdrop: 'gradient', divider: 'slant' }));
  });

  it('los recursos visuales (tarjetas, efecto, fondo, corte y botones) se eligen y se guardan', async () => {
    await abrir();
    await irAAjustes();
    await user().selectOptions(screen.getByLabelText('Tarjetas'), 'glow');
    await user().selectOptions(screen.getByLabelText('Efecto de los títulos'), 'gradient');
    await user().selectOptions(screen.getByLabelText('Fondo de la página'), 'grid');
    await user().selectOptions(screen.getByLabelText('Corte entre secciones'), 'slant');
    await user().selectOptions(screen.getByLabelText('Botones'), 'glow');
    await waitFor(async () => expect((await persistido()).designSpec?.look).toEqual({ surface: 'glow', effect: 'gradient', backdrop: 'grid', divider: 'slant', button: 'glow' }));
    expect(lienzo().style.backgroundImage).toContain('linear-gradient');
  });

  describe('patrón de fondo', () => {
    const imagen = (nombre = 'patron.png', tipo = 'image/png') => new File([new Uint8Array(20)], nombre, { type: tipo });

    it('se sube un patrón, se acomoda y se atenúa, y se guarda en el diseño; también se puede quitar', async () => {
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:patron-1', revokeObjectURL: () => undefined }));
      await abrir();
      await irAAjustes();
      expect(screen.queryByLabelText('Cómo se acomoda')).toBeNull();
      await user().upload(screen.getByLabelText('Subir patrón de fondo'), imagen());
      await waitFor(async () => expect((await persistido()).designSpec?.pattern).toMatchObject({ mode: 'tile', scale: 'md', dim: 0 }));

      await user().selectOptions(await screen.findByLabelText('Cómo se acomoda'), 'cover');
      await user().selectOptions(screen.getByLabelText('Atenuar con el color de fondo'), '50');
      await waitFor(async () => expect((await persistido()).designSpec?.pattern).toMatchObject({ mode: 'cover', dim: 50 }));
      // en «cubrir» ya no se elige el tamaño del mosaico
      expect(screen.queryByLabelText('Tamaño del mosaico')).toBeNull();

      await user().click(screen.getByRole('button', { name: 'Quitar' }));
      await waitFor(async () => expect((await persistido()).designSpec?.pattern).toBeUndefined());
      expect(screen.getByRole('button', { name: /Subir un patrón/ })).toBeInTheDocument();
    });

    it('un archivo que no es una imagen PNG, JPG o WebP se rechaza con un aviso y no cambia el diseño', async () => {
      await abrir();
      await irAAjustes();
      await userEvent.setup({ delay: null, applyAccept: false }).upload(screen.getByLabelText('Subir patrón de fondo'), imagen('logo.svg', 'image/svg+xml'));
      expect(await screen.findByRole('alert')).toHaveTextContent('Solo se aceptan imágenes PNG, JPG o WebP.');
      expect((await persistido()).designSpec?.pattern).toBeUndefined();
    });
  });

  it('el ícono de un beneficio se elige en el editor y se guarda; sin ícono no hay error', async () => {
    await abrir();
    await user().click(within(lista()).getByRole('button', { name: /^Beneficios/ }));
    const panel = screen.getByRole('region', { name: 'Propiedades: Beneficios' });
    const iconos = within(panel).getAllByLabelText('Ícono');
    // la página de respaldo ya trae íconos en sus beneficios
    expect(iconos[0]).toHaveValue('target');
    expect(within(panel).queryByText('Elige una opción de la lista.')).toBeNull();
    await user().selectOptions(iconos[0]!, 'rocket');
    await waitFor(async () => expect(((await persistido()).content.blocks.find((b) => b.type === 'beneficios')?.content.items as { icon?: string }[])[0]?.icon).toBe('rocket'));
    expect(lienzo().innerHTML).toContain('lucide-rocket');
  });

  it('los nuevos fondos de franja (degradado y malla) y los cortes se ofrecen y se guardan', async () => {
    await abrir();
    const grupo = within(screen.getByRole('region', { name: 'Propiedades: Encabezado' })).getByRole('group', { name: 'Diseño del bloque' });
    await user().selectOptions(within(grupo).getByLabelText('Fondo'), 'mesh');
    await waitFor(async () => expect((await persistido()).content.blocks.find((b) => b.key === 'encabezado')?.style).toMatchObject({ background: 'mesh' }));
    await irAAjustes();
    await user().selectOptions(screen.getByLabelText('Corte entre secciones'), 'wave');
    await waitFor(async () => expect((await persistido()).designSpec?.look).toMatchObject({ divider: 'wave' }));
  });
});
