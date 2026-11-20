import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunnel, listFunnels, publishFunnel, type Funnel } from '@/services/funnels';
import { seedFunnel, startDemo } from './helpers/demoApp';
import { montar } from './helpers/renderApp';

let ctx: Awaited<ReturnType<typeof startDemo>>;
let funnel: Funnel;

beforeEach(async () => {
  ctx = await startDemo();
  const creado = await seedFunnel(ctx.token, ctx.workspace, { name: 'Curso de Excel' });
  funnel = await getFunnel(ctx.token, creado.id);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const lista = async () => within(await screen.findByRole('list', { name: 'Tus funnels' }));
const nombres = () => listFunnels(ctx.token, ctx.workspace.id).then((fs) => fs.map((f) => f.name).sort());

describe('copiar, activar, desactivar y eliminar desde la lista de funnels', () => {
  it('copiar crea «Copia de …» en borrador y aparece en la lista', async () => {
    montar('/funnels');
    await userEvent.click((await lista()).getByRole('button', { name: 'Copiar Curso de Excel' }));
    await waitFor(async () => expect(await nombres()).toEqual(['Copia de Curso de Excel', 'Curso de Excel']));
    expect(await (await lista()).findByText('Copia de Curso de Excel')).toBeInTheDocument();
    const copia = (await listFunnels(ctx.token, ctx.workspace.id)).find((f) => f.name.startsWith('Copia'))!;
    expect(copia.status).toBe('draft');
    expect((await getFunnel(ctx.token, copia.id)).content.blocks.length).toBe(funnel.content.blocks.length);
  });

  it('un funnel publicado se puede desactivar (vuelve a borrador) y volver a activar', async () => {
    await publishFunnel(ctx.token, funnel.id);
    montar('/funnels');
    await userEvent.click((await lista()).getByRole('button', { name: 'Desactivar Curso de Excel' }));
    await waitFor(async () => expect((await getFunnel(ctx.token, funnel.id)).status).toBe('draft'));
    await userEvent.click(await (await lista()).findByRole('button', { name: 'Activar Curso de Excel' }));
    await waitFor(async () => expect((await getFunnel(ctx.token, funnel.id)).status).toBe('published'));
  });

  it('activar un funnel al que le falta algo no lo publica y explica por qué', async () => {
    const { createFunnel } = await import('@/services/funnels');
    const vacio = await createFunnel(ctx.token, { workspaceId: ctx.workspace.id, name: 'Vacío', objective: 'leads' });
    montar('/funnels');
    await userEvent.click((await lista()).getByRole('button', { name: 'Activar Vacío' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/todavía no se puede activar/i);
    expect((await getFunnel(ctx.token, vacio.id)).status).toBe('draft');
  });

  it('eliminar pide confirmación; cancelar no borra nada y confirmar lo elimina', async () => {
    montar('/funnels');
    await userEvent.click((await lista()).getByRole('button', { name: 'Eliminar Curso de Excel' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar funnel' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(await nombres()).toEqual(['Curso de Excel']);

    await userEvent.click((await lista()).getByRole('button', { name: 'Eliminar Curso de Excel' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Eliminar funnel' })).getByRole('button', { name: 'Sí, eliminar' }));
    await waitFor(async () => expect(await nombres()).toEqual([]));
    expect(await screen.findByText(/todavía no tienes funnels/i)).toBeInTheDocument();
  });
});
