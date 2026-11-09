import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/features/auth/sessionStore';
import { AI_SAMPLE_PALETTE, SUGGESTED_PALETTE } from '@/features/workspaces/brand';
import { formatBytes, LOGO_MAX_BYTES, validateLogo } from '@/features/workspaces/useLogoFile';
import { createFakeBackend, stubMockEnv, type FakeBackend } from './helpers/fakeBackend';
import { montar } from './helpers/renderApp';

let backend: FakeBackend;
let urls: string[];
const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

beforeEach(() => {
  stubMockEnv();
  backend = createFakeBackend();
  backend.state.workspaces = [];
  sessionStore.set(backend.seedSession('ana@correo.com', 'Ana'));
  // jsdom no trae estas funciones: se simulan para saber qué direcciones se crean y se liberan.
  urls = [];
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:logo-${urls.length + 1}`;
    urls.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const imagen = (nombre = 'logo.png', tipo = 'image/png', bytes = 2048) => {
  const archivo = new File(['x'], nombre, { type: tipo });
  Object.defineProperty(archivo, 'size', { value: bytes });
  return archivo;
};
const subir = (archivo: File) => userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText('Archivo de imagen'), archivo);
const patches = () => backend.calls.filter((c) => c.method === 'PATCH');

async function llegarAMarca() {
  const vista = montar('/bienvenida');
  await userEvent.click(await screen.findByRole('button', { name: /empezar/i }));
  await userEvent.type(screen.getByLabelText(/nombre del negocio/i), 'Nimbral');
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
  await screen.findByRole('heading', { name: /configura tu marca/i });
  return vista;
}

describe('paso «Configura tu marca»: subir una imagen', () => {
  it('ofrece subir una imagen y todavía no ofrece sugerir paleta', async () => {
    await llegarAMarca();
    expect(screen.getByRole('button', { name: /subir imagen/i })).toBeInTheDocument();
    expect(screen.getByText(/png, jpg, webp o svg · hasta 5 mb/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sugerir paleta con ia/i })).not.toBeInTheDocument();
  });

  it('el campo de archivo solo acepta imágenes', async () => {
    await llegarAMarca();
    expect(screen.getByLabelText('Archivo de imagen')).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp,image/svg+xml');
  });

  it('al elegir una imagen la muestra con su nombre y su tamaño, y ofrece cambiarla, quitarla y sugerir paleta', async () => {
    await llegarAMarca();
    await subir(imagen('mi-logo.png', 'image/png', 150 * 1024));
    expect(await screen.findByAltText('Vista previa de tu imagen')).toHaveAttribute('src', 'blob:logo-1');
    expect(screen.getByText('mi-logo.png')).toBeInTheDocument();
    expect(screen.getByText('150 KB')).toBeInTheDocument();
    for (const nombre of ['Cambiar', /quitar/i, /sugerir paleta con ia/i]) expect(screen.getByRole('button', { name: nombre })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /subir imagen/i })).not.toBeInTheDocument();
  });

  it('avisa que por ahora la imagen solo se usa en esta pantalla (no se guarda)', async () => {
    await llegarAMarca();
    expect(screen.queryByText(/solo se usa en esta pantalla/i)).not.toBeInTheDocument();
    await subir(imagen());
    expect(await screen.findByText(/solo se usa en esta pantalla/i)).toBeInTheDocument();
  });

  it('la vista previa de las landing muestra el logo en lugar del nombre', async () => {
    await llegarAMarca();
    const vista = screen.getByLabelText('Vista previa de la marca');
    expect(within(vista).getByText('Nimbral')).toBeInTheDocument();
    await subir(imagen());
    expect(await within(vista).findByAltText('Logo de Nimbral')).toHaveAttribute('src', 'blob:logo-1');
    expect(within(vista).queryByText('Nimbral')).not.toBeInTheDocument();
  });

  it.each([
    ['un GIF', 'animacion.gif', 'image/gif', 1024],
    ['un PDF', 'logo.pdf', 'application/pdf', 1024],
  ])('rechaza %s con un mensaje claro y no muestra nada', async (_nombre, archivo, tipo, bytes) => {
    await llegarAMarca();
    await subir(imagen(archivo, tipo, bytes));
    expect(await screen.findByRole('alert')).toHaveTextContent(/png, jpg, webp o svg/i);
    expect(screen.queryByAltText('Vista previa de tu imagen')).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('rechaza una imagen de más de 5 MB', async () => {
    await llegarAMarca();
    await subir(imagen('enorme.png', 'image/png', LOGO_MAX_BYTES + 1));
    expect(await screen.findByRole('alert')).toHaveTextContent(/más de 5 mb/i);
    expect(screen.queryByAltText('Vista previa de tu imagen')).not.toBeInTheDocument();
  });

  it('acepta una imagen de exactamente 5 MB', async () => {
    await llegarAMarca();
    await subir(imagen('justa.png', 'image/png', LOGO_MAX_BYTES));
    expect(await screen.findByAltText('Vista previa de tu imagen')).toBeInTheDocument();
  });

  it('un archivo inválido no reemplaza la imagen que ya estaba elegida', async () => {
    await llegarAMarca();
    await subir(imagen('buena.png'));
    await screen.findByAltText('Vista previa de tu imagen');
    await subir(imagen('mala.gif', 'image/gif'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('buena.png')).toBeInTheDocument();
  });

  it('un error se quita al elegir una imagen válida', async () => {
    await llegarAMarca();
    await subir(imagen('mala.gif', 'image/gif'));
    await screen.findByRole('alert');
    await subir(imagen('buena.png'));
    await screen.findByAltText('Vista previa de tu imagen');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cambiar la imagen libera la dirección temporal de la anterior', async () => {
    await llegarAMarca();
    await subir(imagen('uno.png'));
    await screen.findByText('uno.png');
    await subir(imagen('dos.png'));
    await screen.findByText('dos.png');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo-1');
    expect(screen.getByAltText('Vista previa de tu imagen')).toHaveAttribute('src', 'blob:logo-2');
  });

  it('«Quitar» vuelve a la zona de subida, libera la imagen y la vista previa vuelve al nombre', async () => {
    await llegarAMarca();
    await subir(imagen());
    await userEvent.click(await screen.findByRole('button', { name: /quitar/i }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo-1');
    expect(screen.getByRole('button', { name: /subir imagen/i })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Vista previa de la marca')).getByText('Nimbral')).toBeInTheDocument();
  });

  it('al salir de la pantalla libera la dirección temporal', async () => {
    const vista = await llegarAMarca();
    await subir(imagen());
    await screen.findByAltText('Vista previa de tu imagen');
    vista.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo-1');
  });
});

describe('paso «Configura tu marca»: sugerir paleta con IA (maqueta)', () => {
  it('«Sugerir paleta con IA» pone la paleta de ejemplo en los colores y en la vista previa, y lo explica', async () => {
    await llegarAMarca();
    await subir(imagen());
    await userEvent.click(await screen.findByRole('button', { name: /sugerir paleta con ia/i }));
    expect(screen.getByLabelText('Código de color: Primario')).toHaveValue(AI_SAMPLE_PALETTE.primary);
    expect(screen.getByLabelText('Código de color: Acento')).toHaveValue(AI_SAMPLE_PALETTE.accent);
    expect(within(screen.getByLabelText('Vista previa de la marca')).getByText('Reservar mi lugar')).toHaveStyle({ backgroundColor: AI_SAMPLE_PALETTE.primary });
    expect(screen.getByRole('status')).toHaveTextContent(/sugerencia de ejemplo/i);
    expect(screen.getByRole('status')).toHaveTextContent(/original ai engine/i);
  });

  it('después de la sugerencia se puede ajustar cualquier color a mano', async () => {
    await llegarAMarca();
    await subir(imagen());
    await userEvent.click(await screen.findByRole('button', { name: /sugerir paleta con ia/i }));
    fireEvent.change(screen.getByLabelText('Selector de color: Acento'), { target: { value: '#112233' } });
    expect(screen.getByLabelText('Código de color: Acento')).toHaveValue('#112233');
    expect(screen.getByLabelText('Código de color: Primario')).toHaveValue(AI_SAMPLE_PALETTE.primary);
  });

  it('la paleta sugerida se guarda con «Guardar y continuar»; la imagen NO se envía a ningún lado', async () => {
    await llegarAMarca();
    await subir(imagen('mi-logo.png'));
    await userEvent.click(await screen.findByRole('button', { name: /sugerir paleta con ia/i }));
    await userEvent.click(screen.getByRole('button', { name: /guardar y continuar/i }));
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(patches()).toHaveLength(1);
    expect(patches()[0]?.body).toEqual({ brandPalette: AI_SAMPLE_PALETTE });
    // Nada de la imagen sale de la pantalla: ni llamadas de archivos ni su nombre en ningún cuerpo.
    expect(backend.calls.some((c) => /file|media|upload|logo/i.test(c.path))).toBe(false);
    expect(JSON.stringify(backend.calls.map((c) => c.body))).not.toContain('mi-logo');
  });

  it('subir otra imagen o quitarla borra el aviso de la sugerencia', async () => {
    await llegarAMarca();
    await subir(imagen('uno.png'));
    await userEvent.click(await screen.findByRole('button', { name: /sugerir paleta con ia/i }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    await subir(imagen('dos.png'));
    await screen.findByText('dos.png');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /sugerir paleta con ia/i }));
    await userEvent.click(screen.getByRole('button', { name: /quitar/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sin sugerir, la paleta de partida sigue siendo la de siempre', async () => {
    await llegarAMarca();
    await subir(imagen());
    await screen.findByAltText('Vista previa de tu imagen');
    expect(screen.getByLabelText('Código de color: Primario')).toHaveValue(SUGGESTED_PALETTE.primary);
  });

  it('«Omitir por ahora» sigue funcionando con una imagen elegida y no guarda nada', async () => {
    await llegarAMarca();
    await subir(imagen());
    await userEvent.click(await screen.findByRole('button', { name: /omitir por ahora/i }));
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(patches()).toHaveLength(0);
  });
});

describe('reglas de la imagen', () => {
  it.each([
    ['image/png', true],
    ['image/jpeg', true],
    ['image/webp', true],
    ['image/svg+xml', true],
    ['image/gif', false],
    ['application/pdf', false],
    ['', false],
  ])('validateLogo(%s) → %s', (tipo, sirve) => {
    expect(validateLogo({ type: tipo, size: 1000 }) === null).toBe(sirve);
  });

  it('el límite es 5 MB', () => {
    expect(validateLogo({ type: 'image/png', size: LOGO_MAX_BYTES })).toBeNull();
    expect(validateLogo({ type: 'image/png', size: LOGO_MAX_BYTES + 1 })).toMatch(/5 mb/i);
  });

  it.each([
    [1, '1 KB'],
    [150 * 1024, '150 KB'],
    [1024 * 1024, '1.0 MB'],
    [2.5 * 1024 * 1024, '2.5 MB'],
  ])('formatBytes(%i) = %s', (bytes, texto) => {
    expect(formatBytes(bytes)).toBe(texto);
  });
});
