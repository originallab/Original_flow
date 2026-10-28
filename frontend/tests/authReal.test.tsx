import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/features/auth/sessionStore';
import { authTiming } from '@/services/originalAuth';
import { navigation } from '@/shared/utils/navigation';
import { createFakeBackend, MOCK_ENV, type FakeBackend } from './helpers/fakeBackend';
import { montar } from './helpers/renderApp';

const PLANTILLA = 'https://auth.ejemplo.com/login?app={token_app}&session={session}';

let backend: FakeBackend;
let irA: ReturnType<typeof vi.spyOn>;
const original = { ...authTiming };

beforeEach(() => {
  // El acceso REAL: con el simulado apagado (aunque el .env de quien corre las pruebas lo tenga) y con la plantilla configurada.
  vi.stubEnv('VITE_AUTH_MODE', '');
  vi.stubEnv('VITE_DEMO_MODE', 'false');
  vi.stubEnv('VITE_TOKEN_APP', 'app-123');
  vi.stubEnv('VITE_ORIGINALAUTH_LOGIN_URL', PLANTILLA);
  authTiming.intervalMs = 2;
  authTiming.maxPolls = 3;
  backend = createFakeBackend();
  irA = vi.spyOn(navigation, 'to').mockImplementation(() => undefined);
});
afterEach(() => {
  Object.assign(authTiming, original);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const llamadas = () => backend.calls.map((c) => `${c.method} ${c.path}`);

/** Una sesión creada en el backend (como la que crea el front antes de ir a Original Auth). */
async function crearSesion(): Promise<string> {
  const res = await fetch('/api/v1/auth/session');
  return ((await res.json()) as { session: string }).session;
}

/** Lo que hace Original Auth por su cuenta cuando la persona inicia sesión: avisar al callback del backend. */
async function avisarCallback(session: string, email = 'ana@correo.com', name = 'Ana') {
  await fetch('/api/v1/auth/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token_app: MOCK_ENV.token, secret_key: MOCK_ENV.secret, session, email, name }),
  });
}

describe('pantalla de acceso con Original Auth real', () => {
  it('ofrece el botón de Original Auth y no el formulario de acceso simulado', async () => {
    montar('/login');
    expect(await screen.findByRole('button', { name: /continuar con original auth/i })).toBeEnabled();
    expect(screen.queryByLabelText(/correo/i)).not.toBeInTheDocument();
  });

  it('crea la sesión, la deja pendiente y manda a la persona a la dirección de Original Auth', async () => {
    montar('/login');
    await userEvent.click(await screen.findByRole('button', { name: /continuar con original auth/i }));

    await waitFor(() => expect(irA).toHaveBeenCalledTimes(1));
    const pendiente = sessionStore.getPending();
    expect(pendiente).toEqual({ session: expect.stringMatching(/^[0-9a-f-]{36}$/), from: '/' });
    expect(irA).toHaveBeenCalledWith(`https://auth.ejemplo.com/login?app=app-123&session=${pendiente?.session}`);
    expect(llamadas()).toEqual(['GET /auth/session']);
    // Todavía no hay sesión iniciada: eso pasa al regresar.
    expect(sessionStore.get()).toBeNull();
  });

  it('recuerda a dónde quería entrar la persona para volver ahí después', async () => {
    montar('/funnels?pestana=1');
    await userEvent.click(await screen.findByRole('button', { name: /continuar con original auth/i }));
    await waitFor(() => expect(irA).toHaveBeenCalled());
    expect(sessionStore.getPending()?.from).toBe('/funnels?pestana=1');
  });

  it('un destino externo que llegue como "a dónde volver" se cambia por la raíz antes de guardarse', async () => {
    montar('/login', { from: 'https://otro.sitio/robar' });
    await userEvent.click(await screen.findByRole('button', { name: /continuar con original auth/i }));
    await waitFor(() => expect(irA).toHaveBeenCalled());
    expect(JSON.parse(sessionStorage.getItem('of-pending-login') ?? '{}').from).toBe('/');
  });

  it('si no se puede crear la sesión muestra el error y deja volver a intentar, sin salir de la aplicación', async () => {
    backend.state.down = true;
    montar('/login');
    await userEvent.click(await screen.findByRole('button', { name: /continuar con original auth/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/conectar/i);
    expect(irA).not.toHaveBeenCalled();
    expect(sessionStore.getPending()).toBeNull();

    backend.state.down = false;
    await userEvent.click(screen.getByRole('button', { name: /continuar con original auth/i }));
    await waitFor(() => expect(irA).toHaveBeenCalledTimes(1));
  });

  it('en producción (sin el modo simulado) también funciona el botón real', async () => {
    vi.stubEnv('DEV', false);
    montar('/login');
    expect(await screen.findByRole('button', { name: /continuar con original auth/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/correo/i)).not.toBeInTheDocument();
  });

  it('sin configurar el acceso real avisa que todavía no está disponible', async () => {
    vi.stubEnv('VITE_ORIGINALAUTH_LOGIN_URL', '');
    montar('/login');
    expect(await screen.findByRole('status')).toHaveTextContent(/todavía no está configurado/i);
    expect(screen.queryByRole('button', { name: /continuar con original auth/i })).not.toBeInTheDocument();
  });
});

describe('regreso de Original Auth (/auth/return)', () => {
  it('con la sesión validada deja la sesión iniciada, limpia el pendiente y entra a la plataforma', async () => {
    const session = await crearSesion();
    await avisarCallback(session);
    sessionStore.setPending({ session, from: '/' });
    backend.calls.length = 0;

    const { router } = montar('/auth/return');
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(sessionStore.get()).toBe(session);
    expect(sessionStore.getPending()).toBeNull();
    expect(llamadas().slice(0, 2)).toEqual(['POST /auth/validate', 'GET /me']);
  });

  it('vuelve a la pantalla a la que quería entrar', async () => {
    const session = await crearSesion();
    await avisarCallback(session);
    sessionStore.setPending({ session, from: '/negocio' });
    const { router } = montar('/auth/return');
    await waitFor(() => expect(router.state.location.pathname).toBe('/negocio'));
  });

  it('mientras Original Auth todavía no avisa al callback, muestra que está verificando y sigue preguntando hasta que llega', async () => {
    authTiming.maxPolls = 50;
    const session = await crearSesion();
    sessionStore.setPending({ session, from: '/' });
    montar('/auth/return');
    expect(await screen.findByRole('status')).toHaveTextContent(/confirmando tu inicio de sesión/i);

    await waitFor(() => expect(backend.calls.filter((c) => c.path === '/auth/validate').length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await avisarCallback(session);
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
  });

  it('si Original Auth nunca valida la sesión muestra el error, descarta el pendiente y permite volver a intentar', async () => {
    const session = await crearSesion();
    sessionStore.setPending({ session, from: '/' });
    const { router } = montar('/auth/return');

    expect(await screen.findByRole('alert')).toHaveTextContent(/no confirmó tu acceso a tiempo/i);
    expect(backend.calls.filter((c) => c.path === '/auth/validate')).toHaveLength(3);
    expect(sessionStore.getPending()).toBeNull();
    expect(sessionStore.get()).toBeNull();

    const volver = screen.getByRole('link', { name: /volver a iniciar sesión/i });
    expect(volver).toHaveAttribute('href', '/login');
    await userEvent.click(volver);
    expect(router.state.location.pathname).toBe('/login');
  });

  it('sin un inicio de sesión en curso lo dice y ni siquiera consulta al servidor', async () => {
    montar('/auth/return');
    expect(await screen.findByRole('alert')).toHaveTextContent(/no encontramos un inicio de sesión en curso/i);
    expect(llamadas().filter((c) => c.endsWith('/auth/validate'))).toHaveLength(0);
  });

  it('quien ya tenía una sesión pero viene de un inicio de sesión en curso termina con la sesión nueva', async () => {
    sessionStore.set(backend.seedSession('ana@correo.com', 'Ana'));
    const nueva = await crearSesion();
    await avisarCallback(nueva, 'bea@correo.com', 'Bea');
    sessionStore.setPending({ session: nueva, from: '/negocio' });

    const { router } = montar('/auth/return');
    await waitFor(() => expect(router.state.location.pathname).toBe('/negocio'));
    expect(sessionStore.get()).toBe(nueva);
  });

  it('quien ya tenía la sesión iniciada y abre esta dirección va a la plataforma, sin error', async () => {
    sessionStore.set(backend.seedSession('ana@correo.com', 'Ana'));
    const { router } = montar('/auth/return');
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByText(/no pudimos confirmar tu acceso|no encontramos un inicio de sesión/i)).not.toBeInTheDocument();
  });

  it('un destino externo guardado se ignora: siempre vuelve a una ruta de la aplicación', async () => {
    const session = await crearSesion();
    await avisarCallback(session);
    sessionStorage.setItem('of-pending-login', JSON.stringify({ session, from: 'https://otro.sitio/robar' }));
    const { router } = montar('/auth/return');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(router.state.location.pathname).toBe('/');
    expect(irA).not.toHaveBeenCalled();
  });

  it('con el servidor caído espera y termina avisando, sin dejar la sesión a medias', async () => {
    const session = await crearSesion();
    sessionStore.setPending({ session, from: '/' });
    backend.state.down = true;
    montar('/auth/return');
    expect(await screen.findByRole('alert')).toHaveTextContent(/no confirmó tu acceso/i);
    expect(sessionStore.get()).toBeNull();
  });
});

describe('error de Original Auth (/auth/error)', () => {
  it('avisa, descarta el inicio en curso y ofrece volver a iniciar sesión', async () => {
    sessionStore.setPending({ session: 's1', from: '/funnels' });
    const { router } = montar('/auth/error?message=<b>hola</b>');
    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudo completar tu inicio de sesión/i);
    expect(sessionStore.getPending()).toBeNull();
    // Lo que venga en la dirección no se muestra.
    expect(document.body).not.toHaveTextContent('<b>hola</b>');

    const volver = screen.getByRole('link', { name: /volver a iniciar sesión/i });
    expect(volver).toHaveAttribute('href', '/login');
    await userEvent.click(volver);
    expect(router.state.location.pathname).toBe('/login');
  });

  it('no necesita sesión para verse', async () => {
    montar('/auth/error');
    expect(await screen.findByRole('heading', { name: /no se pudo iniciar sesión/i })).toBeInTheDocument();
  });
});
