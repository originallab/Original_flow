import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '@/services/api';
import { createSession, mockCallback, validateSession } from '@/services/auth';
import { montar } from './helpers/renderApp';

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true');
  // Sin servidor: si algo intentara llamarlo, esta llamada falla y la prueba lo notaría.
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const escribir = async (campo: RegExp, texto: string) => {
  const input = screen.getByLabelText(campo);
  await userEvent.clear(input);
  await userEvent.type(input, texto);
};

async function iniciarSesion(correo = 'lucia@correo.com', nombre = 'Lucía') {
  await screen.findByRole('heading', { name: /inicia sesión/i });
  await escribir(/correo/i, correo);
  await escribir(/nombre \(opcional\)/i, nombre);
  await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
}

describe('modo demostración: entrar y navegar sin servidor', () => {
  it('al dar «Entrar» no hay error, no se llama a ningún servidor y se llega al alta del negocio', async () => {
    const { router } = montar('/');
    await iniciarSesion();
    expect(await screen.findByRole('heading', { name: /bienvenido a original flow/i })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/bienvenida');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('la pantalla de acceso explica que es una demostración y que no hace falta el servidor', async () => {
    montar('/login');
    expect(await screen.findByText(/modo demostración/i)).toHaveTextContent(/no hace falta el servidor/i);
  });

  it('recorre el alta completa y llega a la plataforma, todo sin servidor', async () => {
    montar('/');
    await iniciarSesion('lucia@correo.com', 'Lucía');
    await userEvent.click(await screen.findByRole('button', { name: /empezar/i }));
    await escribir(/nombre del negocio/i, 'Academia Nimbral');
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await userEvent.click(await screen.findByRole('button', { name: /guardar y continuar/i }));
    expect(await screen.findByRole('heading', { name: 'Hola, Lucía' })).toBeInTheDocument();
    expect(screen.getByLabelText('Negocio activo')).toHaveDisplayValue('Academia Nimbral');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lo creado se conserva al recargar la página (no hay que volver a hacer el alta)', async () => {
    const primera = montar('/');
    await iniciarSesion('lucia@correo.com', 'Lucía');
    await userEvent.click(await screen.findByRole('button', { name: /empezar/i }));
    await escribir(/nombre del negocio/i, 'Academia Nimbral');
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await userEvent.click(await screen.findByRole('button', { name: /omitir por ahora/i }));
    await screen.findByRole('heading', { name: 'Hola, Lucía' });
    primera.unmount();

    montar('/negocio'); // «recargar»: mismo sessionStorage y localStorage, aplicación nueva
    expect(await screen.findByRole('heading', { name: 'Mi negocio' })).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre del negocio/i)).toHaveValue('Academia Nimbral');
  });

  it('«Mi negocio» guarda cambios y los valida como el backend real', async () => {
    montar('/');
    await iniciarSesion();
    await userEvent.click(await screen.findByRole('button', { name: /empezar/i }));
    await escribir(/nombre del negocio/i, 'Nimbral');
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await userEvent.click(await screen.findByRole('button', { name: /omitir por ahora/i }));
    await screen.findByRole('heading', { name: /^hola/i });
    await userEvent.click(screen.getAllByRole('link', { name: /mi negocio/i })[0]!);
    await screen.findByRole('heading', { name: 'Mi negocio' });

    await escribir(/país/i, 'México');
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/cambios guardados/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cada correo tiene sus propios negocios: otro correo vuelve a ver el alta', async () => {
    const primera = montar('/');
    await iniciarSesion('uno@correo.com', 'Uno');
    await userEvent.click(await screen.findByRole('button', { name: /empezar/i }));
    await escribir(/nombre del negocio/i, 'Negocio de Uno');
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await userEvent.click(await screen.findByRole('button', { name: /omitir por ahora/i }));
    await screen.findByRole('heading', { name: 'Hola, Uno' });
    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    await screen.findByRole('heading', { name: /inicia sesión/i });
    primera.unmount();

    montar('/');
    await iniciarSesion('dos@correo.com', 'Dos');
    expect(await screen.findByRole('heading', { name: /bienvenido a original flow/i })).toBeInTheDocument();
  });

  it('volver a entrar con el mismo correo recupera su negocio', async () => {
    const primera = montar('/');
    await iniciarSesion('uno@correo.com', 'Uno');
    await userEvent.click(await screen.findByRole('button', { name: /empezar/i }));
    await escribir(/nombre del negocio/i, 'Negocio de Uno');
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await userEvent.click(await screen.findByRole('button', { name: /omitir por ahora/i }));
    await screen.findByRole('heading', { name: 'Hola, Uno' });
    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    await screen.findByRole('heading', { name: /inicia sesión/i });
    primera.unmount();

    montar('/');
    await iniciarSesion('uno@correo.com', 'Uno');
    expect(await screen.findByRole('heading', { name: 'Hola, Uno' })).toBeInTheDocument();
    expect(screen.getByLabelText('Negocio activo')).toHaveDisplayValue('Negocio de Uno');
  });

  it('cerrar sesión descarta la sesión: ya no se puede entrar a una ruta privada', async () => {
    const { router } = montar('/');
    await iniciarSesion();
    await screen.findByRole('heading', { name: /bienvenido/i });
    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    await screen.findByRole('heading', { name: /inicia sesión/i });
    expect(router.state.location.pathname).toBe('/login');
    expect(sessionStorage.length).toBe(0);
  });
});

describe('modo demostración: el servicio de mentira se comporta como el real', () => {
  it('una sesión sin validar no pasa: la validación devuelve 0 y /me responde 401', async () => {
    const { session } = await createSession();
    expect(await validateSession(session)).toEqual({ validated: 0 });
    const error = (await apiFetch('/me', { token: session }).catch((e) => e)) as ApiError;
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('con el aviso de Original Auth la sesión queda validada', async () => {
    const { session } = await createSession();
    expect(await mockCallback(session, { email: 'ana@correo.com', name: 'Ana' })).toEqual({ validated: 1 });
    expect(await validateSession(session)).toMatchObject({ validated: 1, email: 'ana@correo.com' });
  });

  it('sin token las rutas privadas responden 401 y una ruta desconocida 404', async () => {
    expect(((await apiFetch('/workspaces').catch((e) => e)) as ApiError).status).toBe(401);
    expect(((await apiFetch('/no-existe').catch((e) => e)) as ApiError).status).toBe(404);
  });

  it('un negocio ajeno responde 404 (nunca 403), igual que el backend', async () => {
    const a = (await createSession()).session;
    await mockCallback(a, { email: 'a@correo.com' });
    const negocio = await apiFetch<{ id: string }>('/workspaces', { method: 'POST', body: { name: 'De A' }, token: a });

    const b = (await createSession()).session;
    await mockCallback(b, { email: 'b@correo.com' });
    const error = (await apiFetch(`/workspaces/${negocio.id}`, { method: 'PATCH', body: { name: 'Robado' }, token: b }).catch((e) => e)) as ApiError;
    expect(error.status).toBe(404);
  });

  it('valida igual que el backend: nombre obligatorio, colores #RRGGBB y al menos un campo al editar', async () => {
    const { session } = await createSession();
    await mockCallback(session, { email: 'ana@correo.com' });
    const alta = (await apiFetch('/workspaces', { method: 'POST', body: { name: '   ' }, token: session }).catch((e) => e)) as ApiError;
    expect(alta.status).toBe(422);
    expect(alta.fieldErrors()).toHaveProperty('name');

    const sinNombre = (await apiFetch('/workspaces', { method: 'POST', body: {}, token: session }).catch((e) => e)) as ApiError;
    expect(sinNombre.status).toBe(422);
    expect(sinNombre.fieldErrors()).toHaveProperty('name');

    const negocio = await apiFetch<{ id: string }>('/workspaces', { method: 'POST', body: { name: 'Ok' }, token: session });
    const paleta = { primary: 'rojo', secondary: '#000000', accent: '#000000', background: '#000000', text: '#000000' };
    const color = (await apiFetch(`/workspaces/${negocio.id}`, { method: 'PATCH', body: { brandPalette: paleta }, token: session }).catch((e) => e)) as ApiError;
    expect(color.fieldErrors()).toHaveProperty(['brandPalette.primary']);

    const vacio = (await apiFetch(`/workspaces/${negocio.id}`, { method: 'PATCH', body: {}, token: session }).catch((e) => e)) as ApiError;
    expect(vacio.status).toBe(422);
  });

  it('el segundo negocio de la misma persona cuelga del mismo cliente', async () => {
    const { session } = await createSession();
    await mockCallback(session, { email: 'ana@correo.com' });
    const uno = await apiFetch<{ clientId: string }>('/workspaces', { method: 'POST', body: { name: 'Uno' }, token: session });
    const dos = await apiFetch<{ clientId: string }>('/workspaces', { method: 'POST', body: { name: 'Dos' }, token: session });
    expect(dos.clientId).toBe(uno.clientId);
  });
});

describe('el modo demostración solo existe cuando se pide y solo en desarrollo', () => {
  it('apagado, las llamadas van al servidor de verdad', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    await apiFetch('/auth/session').catch(() => undefined);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fuera de desarrollo (producción) se ignora aunque la variable esté en true', async () => {
    vi.stubEnv('DEV', false);
    await apiFetch('/auth/session').catch(() => undefined);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('sin el modo demostración y sin servidor, el error del login dice que no se pudo conectar (no «inesperado»)', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    vi.stubEnv('VITE_AUTH_MODE', 'mock_callback');
    fetchSpy.mockResolvedValue(new Response(null, { status: 502 }));
    montar('/login');
    await screen.findByRole('heading', { name: /inicia sesión/i });
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo conectar con el servidor/i);
    expect(screen.queryByText(/error inesperado/i)).not.toBeInTheDocument();
  });
});
