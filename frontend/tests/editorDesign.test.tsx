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
    await waitFor(async () => expect((await persistido()).content.blocks.find((b) => b.key === 'encabezado')?.style).toEqual({}));
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
    await waitFor(async () => expect((await persistido()).designSpec?.look).toEqual({ density: 'airy', headingCase: 'upper' }));
    expect(within(lienzo()).getByRole('heading', { level: 1 })).toHaveStyle({ textTransform: 'uppercase' });
    await user().selectOptions(screen.getByLabelText('Títulos'), '');
    await user().selectOptions(screen.getByLabelText('Espacio entre secciones'), '');
    await waitFor(async () => expect((await persistido()).designSpec?.look).toBeUndefined());
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
});
