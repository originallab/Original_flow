import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageUploader, MAX_PAGE_IMAGES } from '@/features/funnels/components/ImageUploader';
import { assetProblem, type Asset } from '@/services/assets';

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true');
  let n = 0;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:prueba-${(n += 1)}`, revokeObjectURL: () => undefined }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function Prueba({ onChange }: { onChange?: (images: Asset[]) => void }) {
  const [value, setValue] = useState<Asset[]>([]);
  return (
    <ImageUploader
      token="t"
      workspaceId="w"
      value={value}
      onChange={(images) => {
        setValue(images);
        onChange?.(images);
      }}
    />
  );
}
const foto = (nombre = 'producto.png', tipo = 'image/png', bytes = 10) => new File([new Uint8Array(bytes)], nombre, { type: tipo });
const elegir = (...files: File[]) => userEvent.upload(screen.getByLabelText('Elegir fotos'), files);

describe('assetProblem', () => {
  it('acepta PNG, JPG y WebP; rechaza SVG, vacíos y más de 5 MB', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) expect(assetProblem({ type, size: 100 })).toBeNull();
    expect(assetProblem({ type: 'image/svg+xml', size: 100 })).toMatch(/PNG, JPG o WebP/);
    expect(assetProblem({ type: 'image/png', size: 0 })).toMatch(/vacío/);
    expect(assetProblem({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/);
  });
});

describe('subir fotos para la página', () => {
  it('sube las fotos elegidas y las muestra con su nombre', async () => {
    const onChange = vi.fn();
    render(<Prueba onChange={onChange} />);
    await elegir(foto('uno.png'), foto('dos.jpg', 'image/jpeg'));
    const lista = await screen.findByRole('list', { name: 'Fotos subidas' });
    await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(2));
    expect(within(lista).getByAltText('uno.png')).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'uno.png' }), expect.objectContaining({ name: 'dos.jpg' })]));
  });

  it('un archivo que no es una imagen permitida no se sube y explica por qué; los buenos sí', async () => {
    render(<Prueba />);
    await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText('Elegir fotos'), [foto('logo.svg', 'image/svg+xml'), foto('bien.png')]);
    expect(await screen.findByRole('alert')).toHaveTextContent('logo.svg: Solo se aceptan imágenes PNG, JPG o WebP.');
    expect(await screen.findByAltText('bien.png')).toBeInTheDocument();
    expect(screen.queryByAltText('logo.svg')).not.toBeInTheDocument();
  });

  it(`permite hasta ${MAX_PAGE_IMAGES} fotos`, async () => {
    render(<Prueba />);
    await elegir(...Array.from({ length: MAX_PAGE_IMAGES + 2 }, (_, i) => foto(`f${i}.png`)));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(MAX_PAGE_IMAGES));
    expect(screen.getByRole('alert')).toHaveTextContent(`Máximo ${MAX_PAGE_IMAGES} imágenes.`);
    expect(screen.getByRole('button', { name: 'Agregar fotos' })).toBeDisabled();
  });

  it('se puede quitar una foto', async () => {
    render(<Prueba />);
    await elegir(foto('uno.png'), foto('dos.png'));
    await screen.findByAltText('dos.png');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar uno.png' }));
    expect(screen.queryByAltText('uno.png')).not.toBeInTheDocument();
    expect(screen.getByAltText('dos.png')).toBeInTheDocument();
  });
});
