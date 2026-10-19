import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/features/auth/sessionStore';
import { createFakeBackend, stubMockEnv, type FakeBackend } from './helpers/fakeBackend';
import { montar as montarApp } from './helpers/renderApp';

let backend: FakeBackend;
beforeEach(() => {
  stubMockEnv();
  backend = createFakeBackend();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const montar = (ruta: string) => montarApp(ruta).router;

const escribir = async (campo: RegExp, texto: string) => {
  const input = screen.getByLabelText(campo);
  await userEvent.clear(input);
  await userEvent.type(input, texto);
};

describe('rutas protegidas', () => {
  it('sin sesión, una ruta protegida manda a /login', async () => {
    const router = montar('/');
    await screen.findByRole('heading', { name: /inicia sesión/i });
    expect(router.state.location.pathname).toBe('/login');
  });

  it('con una sesión guardada válida entra directo y muestra a la persona', async () => {
    sessionStore.set(backend.seedSession('ana@correo.com', 'Ana'));
    montar('/');
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
  });

  it('una sesión guardada que ya venció se descarta y manda a /login', async () => {
    sessionStore.set('22222222-2222-4222-8222-222222222222');
    const router = montar('/');
    await screen.findByRole('heading', { name: /inicia sesión/i });
    expect(router.state.location.pathname).toBe('/login');
    expect(sessionStore.get()).toBeNull();
  });

  it('si el servidor no responde NO borra la sesión guardada y ofrece reintentar', async () => {
    const token = backend.seedSession('ana@correo.com', 'Ana');
    sessionStore.set(token);
    backend.state.down = true;
    montar('/');
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo conectar/i);
    expect(sessionStore.get()).toBe(token);

    backend.state.down = false;
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
  });

  it('mientras comprueba la sesión no muestra nada protegido', async () => {
    sessionStore.set(backend.seedSession('ana@correo.com', 'Ana'));
    montar('/');
    expect(screen.getByRole('status')).toHaveTextContent(/comprobando/i);
    expect(screen.queryByRole('heading', { name: /hola/i })).not.toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Hola, Ana' });
  });
});

describe('inicio de sesión (Original Auth simulado)', () => {
  it('con un correo válido inicia sesión, guarda el token y entra a la plataforma', async () => {
    const router = montar('/login');
    await screen.findByRole('heading', { name: /inicia sesión/i });
    await escribir(/correo/i, 'maria@correo.com');
    await escribir(/nombre/i, 'María');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('heading', { name: 'Hola, María' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(sessionStore.get()).toMatch(/^[0-9a-f-]{36}$/);
    // El orden de llamadas es el del flujo real de Original Auth.
    expect(backend.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /auth/session', 'POST /auth/callback', 'POST /auth/validate', 'GET /me', 'GET /workspaces']);
  });

  it('el token se guarda en sessionStorage y nunca en localStorage', async () => {
    montar('/login');
    await screen.findByRole('heading', { name: /inicia sesión/i });
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    await screen.findByRole('heading', { name: /hola/i });
    expect(localStorage.getItem('of-session')).toBeNull();
    expect(sessionStorage.getItem('of-session')).not.toBeNull();
  });

  it('vuelve a la pantalla a la que quería entrar antes de iniciar sesión', async () => {
    const router = montar('/?pestana=1');
    await screen.findByRole('heading', { name: /inicia sesión/i });
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    await screen.findByRole('heading', { name: /hola/i });
    expect(router.state.location.pathname + router.state.location.search).toBe('/?pestana=1');
  });

  it('si el backend no valida la sesión muestra un error claro y no guarda nada', async () => {
    backend.state.secretOk = false;
    montar('/login');
    await screen.findByRole('heading', { name: /inicia sesión/i });
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo validar/i);
    expect(sessionStorage.length).toBe(0);
  });

  it('si no hay conexión muestra el mensaje de red y se puede volver a intentar', async () => {
    backend.state.down = true;
    montar('/login');
    await screen.findByRole('heading', { name: /inicia sesión/i });
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/conectar/i);
    backend.state.down = false;
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByRole('heading', { name: /hola/i })).toBeInTheDocument();
  });

  it('sin correo el botón de entrar está deshabilitado', async () => {
    montar('/login');
    await screen.findByRole('heading', { name: /inicia sesión/i });
    await userEvent.clear(screen.getByLabelText(/correo/i));
    expect(screen.getByRole('button', { name: /entrar/i })).toBeDisabled();
  });

  it('una persona que ya tiene sesión y abre /login es enviada a la plataforma', async () => {
    sessionStore.set(backend.seedSession('ana@correo.com', 'Ana'));
    const router = montar('/login');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(router.state.location.pathname).toBe('/');
  });

  it('fuera del modo simulado (producción) no ofrece formulario de acceso falso', async () => {
    vi.stubEnv('DEV', false);
    montar('/login');
    expect(await screen.findByRole('status')).toHaveTextContent(/todavía no está configurado/i);
    expect(screen.queryByLabelText(/correo/i)).not.toBeInTheDocument();
  });
});

describe('cierre de sesión', () => {
  it('cierra la sesión en pantalla, borra el token y avisa al servidor', async () => {
    const token = backend.seedSession('ana@correo.com', 'Ana');
    sessionStore.set(token);
    const router = montar('/');
    await screen.findByRole('heading', { name: 'Hola, Ana' });

    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    await screen.findByRole('heading', { name: /inicia sesión/i });
    expect(router.state.location.pathname).toBe('/login');
    expect(sessionStore.get()).toBeNull();
    await waitFor(() => expect(backend.callsTo(`/auth/session/${token}`)[0]?.method).toBe('DELETE'));
  });

  it('cierra la sesión aunque el servidor no responda', async () => {
    sessionStore.set(backend.seedSession('ana@correo.com', 'Ana'));
    montar('/');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    backend.state.down = true;
    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    await screen.findByRole('heading', { name: /inicia sesión/i });
    expect(sessionStore.get()).toBeNull();
  });
});

describe('reglas de diseño en las pantallas de acceso y de la plataforma', () => {
  it('el logotipo completo va arriba a la izquierda en /login y en la plataforma', async () => {
    montar('/login');
    await screen.findByRole('heading', { name: /inicia sesión/i });
    const encabezadoLogin = screen.getByRole('banner');
    expect(encabezadoLogin.firstElementChild).toBe(screen.getByRole('img', { name: 'Original Flow' }));
  });

  it('en la plataforma el encabezado empieza con el logotipo', async () => {
    sessionStore.set(backend.seedSession('ana@correo.com', 'Ana'));
    montar('/');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(screen.getByRole('banner').firstElementChild).toBe(screen.getByRole('img', { name: 'Original Flow' }));
  });
});

describe('inicio', () => {
  it('muestra el negocio con el que se está trabajando', async () => {
    backend.state.workspaces[0]!.name = 'Academia Nimbral';
    sessionStore.set(backend.seedSession('ana@correo.com', 'Ana'));
    montar('/');
    expect(await screen.findByText('Academia Nimbral', { selector: 'strong' })).toBeInTheDocument();
  });
});
