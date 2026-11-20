import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startDemo } from './helpers/demoApp';
import { montar } from './helpers/renderApp';

beforeEach(async () => {
  let n = 0;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:logo-${(n += 1)}`, revokeObjectURL: () => undefined }));
  await startDemo();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const seccion = async () => within(await screen.findByRole('region', { name: 'Logo' }));
const logo = (nombre = 'logo.png', tipo = 'image/png') => new File([new Uint8Array(20)], nombre, { type: tipo });

describe('logo del negocio en «Mi negocio»', () => {
  it('sin logo lo dice y ofrece subir uno', async () => {
    montar('/negocio');
    const s = await seccion();
    expect(s.getByText('Sin logo')).toBeInTheDocument();
    expect(s.getByRole('button', { name: 'Subir logo' })).toBeInTheDocument();
    expect(s.queryByRole('button', { name: 'Quitar logo' })).not.toBeInTheDocument();
  });

  it('subir un logo lo guarda y lo muestra; después se puede cambiar y quitar', async () => {
    montar('/negocio');
    const s = await seccion();
    await userEvent.upload(s.getByLabelText('Archivo de logo'), logo());
    expect(await s.findByAltText(/logo de/i)).toBeInTheDocument();
    expect(s.getByRole('button', { name: 'Cambiar logo' })).toBeInTheDocument();

    await userEvent.click(s.getByRole('button', { name: 'Quitar logo' }));
    await waitFor(() => expect(s.getByText('Sin logo')).toBeInTheDocument());
    expect(s.getByRole('button', { name: 'Subir logo' })).toBeInTheDocument();
  });

  it('un archivo que no es PNG, JPG o WebP no se sube y explica por qué', async () => {
    montar('/negocio');
    const s = await seccion();
    await userEvent.setup({ applyAccept: false }).upload(s.getByLabelText('Archivo de logo'), logo('logo.svg', 'image/svg+xml'));
    expect(await s.findByRole('alert')).toHaveTextContent('Solo se aceptan imágenes PNG, JPG o WebP.');
    expect(s.getByText('Sin logo')).toBeInTheDocument();
  });
});
