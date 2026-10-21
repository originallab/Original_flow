import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api';
import * as publicService from '@/services/publicPages';
import { updateCta, updateFunnel } from '@/services/funnels';
import { navigation } from '@/shared/utils/navigation';
import { bloque, CONFIGS, editarBaseDeDemostracion, FORMULARIO, leerBaseDeDemostracion, publicarFunnel, simularIntersectionObserver } from './helpers/publicApp';
import { montar } from './helpers/renderApp';

const tiempos = vi.hoisted(() => ({ track: 25, redirect: 40 }));
vi.mock('@/features/publicPage/constants', () => ({
  get TRACK_DELAY_MS() {
    return tiempos.track;
  },
  MAX_BATCH: 20,
  get REDIRECT_DELAY_MS() {
    return tiempos.redirect;
  },
}));
vi.mock('@/services/publicPages', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/publicPages')>();
  return { ...original, getPublicPage: vi.fn(original.getPublicPage), sendLead: vi.fn(original.sendLead), sendEvents: vi.fn(original.sendEvents) };
});

beforeEach(() => {
  tiempos.track = 25;
  tiempos.redirect = 40;
  for (const fn of [publicService.getPublicPage, publicService.sendLead, publicService.sendEvents]) vi.mocked(fn).mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  document.head.querySelectorAll('meta[name="description"], meta[name="robots"]').forEach((m) => m.remove());
});

const eventosEnviados = () => vi.mocked(publicService.sendEvents).mock.calls.flatMap(([, lote]) => lote);
const esperarEventos = (n: number) => waitFor(() => expect(eventosEnviados().length).toBeGreaterThanOrEqual(n));
const formulario = () => screen.getByRole('form', { name: 'Déjanos tus datos' });
const escribir = (etiqueta: string, texto: string) => userEvent.type(within(formulario()).getByLabelText(etiqueta, { exact: false }), texto);

async function abrir(slug: string, busqueda = '') {
  const vista = montar(`/p/${slug}${busqueda}`);
  await screen.findByRole('article', { name: 'Página' });
  // Los efectos de la página (idioma, título, visita, escuchas) corren un instante después de dibujarla.
  await waitFor(() => expect(document.documentElement.lang).not.toBe(''));
  return vista;
}
async function llenarYEnviar(extra: () => Promise<void> = async () => undefined) {
  await escribir('Nombre', 'María Pérez');
  await escribir('Correo', 'MARIA@correo.com');
  await extra();
  await userEvent.click(within(formulario()).getByRole('checkbox', { name: /acepto que usen mis datos/i }));
  await userEvent.click(within(formulario()).getByRole('button', { name: 'Quiero mi lugar' }));
}

describe('la página publicada', () => {
  it('la ve cualquier visitante, sin sesión y sin el logotipo de la plataforma', async () => {
    const { slug } = await publicarFunnel();
    const { router } = await abrir(slug);
    expect(router.state.location.pathname).toBe(`/p/${slug}`);
    expect(screen.getByRole('heading', { level: 1, name: 'Aprende datos' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Original Flow' })).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /iniciar sesión|cerrar sesión/i })).not.toBeInTheDocument();
  });

  it('usa los colores del diseño de la página (la marca del cliente)', async () => {
    const { slug } = await publicarFunnel();
    await abrir(slug);
    expect(screen.getByRole('article', { name: 'Página' })).toHaveAttribute('data-template', 'claridad');
  });

  it('mientras carga dice «Cargando…»', async () => {
    const { slug } = await publicarFunnel();
    const real = await vi.importActual<typeof import('@/services/publicPages')>('@/services/publicPages');
    let soltar: () => void = () => undefined;
    vi.mocked(publicService.getPublicPage).mockImplementationOnce((s) => new Promise((resolver) => (soltar = () => resolver(real.getPublicPage(s)))));
    montar(`/p/${slug}`);
    expect(await screen.findByText('Cargando…')).toBeInTheDocument();
    soltar();
    await screen.findByRole('article', { name: 'Página' });
  });

  it('un funnel en borrador, una dirección que no existe o mal escrita muestran «no está disponible», sin logotipo', async () => {
    const { slug, token, funnel } = await publicarFunnel();
    for (const direccion of ['no-existe-esta-pagina', 'Mal Escrita!']) {
      const { unmount } = montar(`/p/${encodeURIComponent(direccion)}`);
      expect(await screen.findByRole('heading', { name: /esta página no está disponible/i })).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: 'Original Flow' })).not.toBeInTheDocument();
      unmount();
    }
    const { unpublishFunnel } = await import('@/services/funnels');
    await unpublishFunnel(token, funnel.id);
    montar(`/p/${slug}`);
    expect(await screen.findByRole('heading', { name: /esta página no está disponible/i })).toBeInTheDocument();
  });

  it('si no se puede cargar avisa y deja reintentar', async () => {
    const { slug } = await publicarFunnel();
    vi.mocked(publicService.getPublicPage).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    montar(`/p/${slug}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo cargar la página/i);
    vi.mocked(publicService.getPublicPage).mockReset();
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    await screen.findByRole('article', { name: 'Página' });
  });

  it('no se mide nada si la página no existe', async () => {
    await publicarFunnel();
    montar('/p/no-existe-esta-pagina');
    await screen.findByRole('heading', { name: /esta página no está disponible/i });
    await new Promise((r) => setTimeout(r, 80));
    expect(publicService.sendEvents).not.toHaveBeenCalled();
  });
});

describe('título, descripción e indexación (SEO)', () => {
  it('usa el título y la descripción del funnel; sin título usa su nombre; al salir lo deja como estaba', async () => {
    const { slug } = await publicarFunnel({ name: 'Mentoría de datos' });
    document.title = 'Original Flow';
    const vista = await abrir(slug);
    await waitFor(() => expect(document.title).toBe('Mentoría de datos'));
    expect(document.documentElement.lang).toBe('es');
    expect(document.head.querySelector('meta[name="description"]')).toBeNull();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    vista.unmount();
    expect(document.title).toBe('Original Flow');
    expect(document.documentElement.lang).toBe('');
  });

  it('con un SEO guardado: título, descripción y «noindex» cuando no se debe indexar', async () => {
    const { slug } = await publicarFunnel();
    editarBaseDeDemostracion((db) => {
      db.funnels[0].seo = { title: 'Aprende datos en 30 días', description: 'Un curso práctico', indexable: false };
    });
    const vista = await abrir(slug);
    await waitFor(() => expect(document.title).toBe('Aprende datos en 30 días'));
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute('content', 'Un curso práctico');
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    vista.unmount();
    expect(document.head.querySelector('meta[name="description"]')).toBeNull();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('si indexable es true no pide «noindex»', async () => {
    const { slug } = await publicarFunnel();
    editarBaseDeDemostracion((db) => {
      db.funnels[0].seo = { indexable: true };
    });
    await abrir(slug);
    await waitFor(() => expect(document.title).toBe('Mentoría de datos'));
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('el idioma de la página sale del idioma del funnel (es-MX → es)', async () => {
    const { slug } = await publicarFunnel();
    editarBaseDeDemostracion((db) => {
      db.funnels[0].language = 'en-US';
    });
    await abrir(slug);
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
  });
});

describe('el formulario', () => {
  it('muestra los campos del bloque con sus etiquetas y marca los obligatorios', async () => {
    const { slug } = await publicarFunnel();
    await abrir(slug);
    const f = formulario();
    expect(within(f).getByLabelText('Nombre *')).toHaveAttribute('aria-required', 'true');
    expect(within(f).getByLabelText('Correo *')).toHaveAttribute('type', 'email');
    expect(within(f).getByLabelText('Teléfono')).toHaveAttribute('type', 'tel');
    expect(within(f).getByLabelText('Mensaje').tagName).toBe('TEXTAREA');
    expect(within(f).getByRole('checkbox', { name: /acepto que usen mis datos/i })).not.toBeChecked();
    expect(within(f).getByRole('button', { name: 'Quiero mi lugar' })).toBeEnabled();
  });

  it('una lista de opciones se ofrece con su opción vacía', async () => {
    const { slug } = await publicarFunnel({
      blocks: [bloque('formulario', 'formulario', { title: 'Déjanos tus datos', fields: [{ name: 'email', label: 'Correo', type: 'email', required: true }, { name: 'pais', label: 'País', type: 'select', required: false, options: ['México', 'Chile'] }], submitLabel: 'Quiero mi lugar' })],
    });
    await abrir(slug);
    const pais = within(formulario()).getByLabelText('País');
    expect(within(pais).getAllByRole('option').map((o) => o.textContent)).toEqual(['Elige una opción', 'México', 'Chile']);
  });

  it('enviarlo vacío marca los obligatorios y el consentimiento, y no manda nada', async () => {
    const { slug } = await publicarFunnel();
    await abrir(slug);
    await userEvent.click(within(formulario()).getByRole('button', { name: 'Quiero mi lugar' }));
    const f = formulario();
    expect(within(f).getAllByText('Este campo es obligatorio.')).toHaveLength(2);
    expect(within(f).getByText(/debes aceptar el tratamiento de tus datos/i)).toBeInTheDocument();
    expect(within(f).getByLabelText('Nombre *')).toBeInvalid();
    expect(within(f).getByLabelText('Nombre *')).toHaveAccessibleDescription('Este campo es obligatorio.');
    expect(publicService.sendLead).not.toHaveBeenCalled();
  });

  it('un correo mal escrito se marca en su campo', async () => {
    const { slug } = await publicarFunnel();
    await abrir(slug);
    await escribir('Nombre', 'María');
    await escribir('Correo', 'maria@');
    await userEvent.click(within(formulario()).getByRole('checkbox', { name: /acepto/i }));
    await userEvent.click(within(formulario()).getByRole('button', { name: 'Quiero mi lugar' }));
    expect(within(formulario()).getByText(/escribe un correo válido/i)).toBeInTheDocument();
    expect(within(formulario()).getByLabelText('Correo *')).toBeInvalid();
    expect(publicService.sendLead).not.toHaveBeenCalled();
  });

  it('escribir en un campo quita su aviso', async () => {
    const { slug } = await publicarFunnel();
    await abrir(slug);
    await userEvent.click(within(formulario()).getByRole('button', { name: 'Quiero mi lugar' }));
    await escribir('Nombre', 'M');
    expect(within(formulario()).getByLabelText('Nombre *')).toBeValid();
    await userEvent.click(within(formulario()).getByRole('checkbox', { name: /acepto/i }));
    expect(within(formulario()).queryByText(/debes aceptar/i)).not.toBeInTheDocument();
  });

  it('un teléfono mal escrito se marca en su campo', async () => {
    const { slug } = await publicarFunnel();
    await abrir(slug);
    await escribir('Nombre', 'María');
    await escribir('Correo', 'maria@correo.com');
    await escribir('Teléfono', 'abc');
    await userEvent.click(within(formulario()).getByRole('checkbox', { name: /acepto/i }));
    await userEvent.click(within(formulario()).getByRole('button', { name: 'Quiero mi lugar' }));
    expect(within(formulario()).getByLabelText('Teléfono')).toBeInvalid();
  });

  it('envía el lead con consentimiento y sus datos: correo en el email, nombre en el name, lo demás en campos extra', async () => {
    const { slug } = await publicarFunnel();
    await abrir(slug);
    await llenarYEnviar(async () => {
      await escribir('Teléfono', '55 1234 5678');
      await escribir('Mensaje', 'Quiero aprender');
    });
    await screen.findByRole('heading', { name: '¡Gracias!' });
    expect(publicService.sendLead).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publicService.sendLead).mock.calls[0]![0]).toBe(slug);
    expect(vi.mocked(publicService.sendLead).mock.calls[0]![1]).toEqual({
      consent: true,
      name: 'María Pérez',
      email: 'MARIA@correo.com',
      phone: '55 1234 5678',
      customFields: { mensaje: 'Quiero aprender' },
      utm: {},
    });
    const [lead] = leerBaseDeDemostracion().leads;
    expect(lead).toMatchObject({ name: 'María Pérez', email: 'maria@correo.com', phone: '55 1234 5678', source: 'web_form' });
  });

  it('manda los UTM de la dirección y el referente con el lead', async () => {
    const { slug } = await publicarFunnel();
    Object.defineProperty(document, 'referrer', { value: 'https://instagram.com/mi-cuenta', configurable: true });
    await abrir(slug, '?utm_source=instagram&utm_medium=bio&utm_campaign=octubre&otro=x');
    await llenarYEnviar();
    await screen.findByRole('heading', { name: '¡Gracias!' });
    expect(vi.mocked(publicService.sendLead).mock.calls[0]![1].utm).toEqual({ utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'octubre', referrer: 'https://instagram.com/mi-cuenta' });
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  });

  it('mientras se envía el botón dice «Enviando…» y un segundo clic no manda otro lead', async () => {
    const { slug } = await publicarFunnel();
    await abrir(slug);
    vi.mocked(publicService.sendLead).mockImplementation(() => new Promise(() => undefined));
    await escribir('Nombre', 'María');
    await escribir('Correo', 'maria@correo.com');
    await userEvent.click(within(formulario()).getByRole('checkbox', { name: /acepto/i }));
    await userEvent.click(within(formulario()).getByRole('button', { name: 'Quiero mi lugar' }));
    const boton = await within(formulario()).findByRole('button', { name: 'Enviando…' });
    expect(boton).toBeDisabled();
    fireEvent.submit(formulario());
    expect(publicService.sendLead).toHaveBeenCalledTimes(1);
  });

  it('un problema que devuelve el servidor se muestra junto a su campo', async () => {
    const { slug } = await publicarFunnel();
    await abrir(slug);
    vi.mocked(publicService.sendLead).mockRejectedValueOnce(
      new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'email', message: 'El servidor no acepta ese correo' }, { path: 'customFields.mensaje', message: 'Mensaje demasiado largo' }], 'req_1'),
    );
    await llenarYEnviar();
    expect(await within(formulario()).findByText('El servidor no acepta ese correo')).toBeInTheDocument();
    expect(within(formulario()).getByText('Mensaje demasiado largo')).toBeInTheDocument();
    expect(within(formulario()).getByLabelText('Correo *')).toBeInvalid();
    expect(within(formulario()).getByRole('button', { name: 'Quiero mi lugar' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: '¡Gracias!' })).not.toBeInTheDocument();
  });

  it('un rechazo del consentimiento que devuelve el servidor se muestra junto a la casilla', async () => {
    const { slug } = await publicarFunnel();
    await abrir(slug);
    vi.mocked(publicService.sendLead).mockRejectedValueOnce(new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'consent', message: 'Falta el consentimiento' }], 'r'));
    await llenarYEnviar();
    expect(await within(formulario()).findByText('Falta el consentimiento')).toBeInTheDocument();
    const casilla = within(formulario()).getByRole('checkbox', { name: /acepto/i });
    expect(casilla).toBeInvalid();
    expect(casilla).toHaveAccessibleDescription('Falta el consentimiento');
  });

  it.each([
    [new ApiError(429, 'RATE_LIMITED', 'Demasiadas peticiones'), /demasiados intentos/i],
    [new ApiError(404, 'PAGE_NOT_FOUND', 'Página no encontrada'), /ya no está disponible/i],
    [new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'), /no se pudo enviar/i],
    [new ApiError(500, 'UNKNOWN_ERROR', 'Error'), /no se pudo enviar/i],
  ])('un error general (%o) se explica con un mensaje claro y se puede volver a intentar', async (error, mensaje) => {
    const { slug } = await publicarFunnel();
    await abrir(slug);
    vi.mocked(publicService.sendLead).mockRejectedValueOnce(error);
    await llenarYEnviar();
    expect(await within(formulario()).findByRole('alert')).toHaveTextContent(mensaje);
    expect(within(formulario()).getByLabelText('Nombre *')).toHaveValue('María Pérez');
    expect(within(formulario()).getByRole('button', { name: 'Quiero mi lugar' })).toBeEnabled();
  });

  it('un formulario sin campo de correo ni teléfono avisa que hace falta uno de los dos', async () => {
    const { slug } = await publicarFunnel({ blocks: [bloque('formulario', 'formulario', { title: 'Déjanos tus datos', fields: [{ name: 'nombre', label: 'Nombre', type: 'text', required: false }], submitLabel: 'Quiero mi lugar' })] });
    await abrir(slug);
    await userEvent.click(within(formulario()).getByRole('checkbox', { name: /acepto/i }));
    await userEvent.click(within(formulario()).getByRole('button', { name: 'Quiero mi lugar' }));
    expect(await within(formulario()).findByRole('alert')).toHaveTextContent(/correo o un teléfono/i);
  });
});

describe('los botones', () => {
  const botones = (acciones: Record<string, Parameters<typeof updateCta>[3]>) => ({
    blocks: [bloque('encabezado'), bloque('boton', 'boton', { label: 'Empezar' }, 2), bloque('beneficios', 'beneficios', undefined, 3), FORMULARIO],
    acciones,
  });
  let scroll: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll as never;
  });

  it('«llevar a otra parte» baja al formulario por defecto y mide el clic', async () => {
    const { slug } = await publicarFunnel(botones({}));
    await abrir(slug);
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(screen.getByRole('form', { name: 'Déjanos tus datos' }).closest('[data-block-key]'));
    await esperarEventos(2);
    expect(eventosEnviados()).toContainEqual({ type: 'button_click', properties: { blockKey: 'boton' } });
  });

  it('si el botón apunta a un bloque, baja a ese bloque', async () => {
    const { slug, token, funnel } = await publicarFunnel(botones({}));
    await updateCta(token, funnel.id, 'boton', { actionType: 'scroll_to', destination: 'beneficios' });
    await abrir(slug);
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    expect((scroll.mock.contexts[0] as HTMLElement).dataset.blockKey).toBe('beneficios');
  });

  it('«abrir un enlace» es un enlace que se abre en otra pestaña, sin dar acceso a la página, y mide el clic', async () => {
    const { slug, token, funnel } = await publicarFunnel(botones({}));
    await updateCta(token, funnel.id, 'boton', { actionType: 'url', destination: 'https://oferta.test/promo' });
    await abrir(slug);
    const enlace = screen.getByRole('link', { name: 'Empezar' });
    expect(enlace).toHaveAttribute('href', 'https://oferta.test/promo');
    expect(enlace).toHaveAttribute('target', '_blank');
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer');
    enlace.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(enlace);
    await esperarEventos(2);
    expect(eventosEnviados()).toContainEqual({ type: 'button_click', properties: { blockKey: 'boton' } });
  });

  it('un destino que no es http o https (javascript:, data:) NUNCA se pone como enlace', async () => {
    for (const peligroso of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://x.test']) {
      const { slug } = await publicarFunnel({ ...botones({}), name: `Peligro ${peligroso.slice(0, 4)}` });
      editarBaseDeDemostracion((db) => {
        for (const cta of db.ctas) if (cta.blockKey === 'boton') Object.assign(cta, { actionType: 'url', destination: peligroso });
      });
      const { unmount } = await abrir(slug);
      expect(screen.queryByRole('link', { name: 'Empezar' }), peligroso).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Empezar' }), peligroso).toBeDisabled();
      unmount();
    }
  });

  it('un botón de pago todavía no cobra: se ve deshabilitado con su explicación', async () => {
    const { slug } = await publicarFunnel(botones({}));
    editarBaseDeDemostracion((db) => {
      for (const cta of db.ctas) if (cta.blockKey === 'boton') cta.actionType = 'checkout';
    });
    await abrir(slug);
    const boton = screen.getByRole('button', { name: 'Empezar' });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('title', 'El pago todavía no está disponible');
  });

  it('el calendario y el video muestran su botón solo si el enlace es seguro', async () => {
    const { slug } = await publicarFunnel({
      blocks: [bloque('video', 'video', { url: 'https://video.test/1', title: 'Mira esto' }), bloque('calendario', 'calendario', { title: 'Elige tu horario', url: 'javascript:alert(1)' }, 2), FORMULARIO],
    });
    await abrir(slug);
    expect(screen.getByRole('link', { name: 'Ver el video' })).toHaveAttribute('href', 'https://video.test/1');
    expect(screen.queryByRole('link', { name: 'Elegir mi horario' })).not.toBeInTheDocument();
  });

  it('un calendario con enlace seguro ofrece «Elegir mi horario»', async () => {
    const { slug } = await publicarFunnel({ blocks: [bloque('calendario', 'calendario', { title: 'Elige tu horario', url: 'https://cal.test/ana' }), FORMULARIO] });
    await abrir(slug);
    expect(screen.getByRole('link', { name: 'Elegir mi horario' })).toHaveAttribute('href', 'https://cal.test/ana');
  });
});

describe('elementos que funcionan solos', () => {
  it('las preguntas frecuentes se abren y se cierran', async () => {
    const { slug } = await publicarFunnel({ blocks: [bloque('faq', 'faq', { items: [{ question: '¿Cuánto cuesta?', answer: 'Mil pesos.' }] }), FORMULARIO] });
    await abrir(slug);
    const detalle = screen.getByText('¿Cuánto cuesta?').closest('details')!;
    expect(detalle).not.toHaveAttribute('open');
    await userEvent.click(screen.getByText('¿Cuánto cuesta?'));
    expect(detalle).toHaveAttribute('open');
    expect(screen.getByText('Mil pesos.')).toBeVisible();
  });

  it('la cuenta regresiva avanza sola cada segundo y se detiene en cero', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const termina = new Date(Date.now() + 65_000).toISOString();
    const { slug } = await publicarFunnel({ blocks: [bloque('contador', 'contador', { endsAt: termina, label: 'Termina en' }), FORMULARIO] });
    await abrir(slug);
    const reloj = screen.getByRole('timer', { name: 'Tiempo restante' });
    const antes = within(reloj).getByText('seg').previousElementSibling!.textContent;
    await vi.advanceTimersByTimeAsync(3000);
    expect(within(reloj).getByText('seg').previousElementSibling!.textContent).not.toBe(antes);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(within(reloj).getAllByText('00')).toHaveLength(4);
    vi.useRealTimers();
  });
});

describe('medir la visita', () => {
  it('manda la visita con su origen (utm_source), una sola vez', async () => {
    const { slug } = await publicarFunnel();
    await abrir(slug, '?utm_source=instagram');
    await esperarEventos(1);
    expect(eventosEnviados()).toEqual([{ type: 'page_view', properties: { source: 'instagram' } }]);
    expect(vi.mocked(publicService.sendEvents).mock.calls[0]![0]).toBe(slug);
  });

  it('sin utm_source usa el sitio desde el que llegó la persona (si no es el propio)', async () => {
    const { slug } = await publicarFunnel();
    Object.defineProperty(document, 'referrer', { value: 'https://www.google.com/search?q=datos', configurable: true });
    await abrir(slug);
    await esperarEventos(1);
    expect(eventosEnviados()[0]).toEqual({ type: 'page_view', properties: { source: 'www.google.com' } });
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  });

  it('un referente del mismo sitio no cuenta como origen', async () => {
    const { slug } = await publicarFunnel();
    Object.defineProperty(document, 'referrer', { value: `http://${window.location.hostname}/otra-pagina`, configurable: true });
    await abrir(slug);
    await esperarEventos(1);
    expect(eventosEnviados()[0]).toEqual({ type: 'page_view', properties: {} });
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  });

  it('cambiar los parámetros de la dirección no cuenta otra visita', async () => {
    const { slug } = await publicarFunnel();
    const { router } = await abrir(slug, '?utm_source=instagram');
    await esperarEventos(1);
    await act(() => router.navigate(`/p/${slug}?utm_source=otro`));
    await new Promise((r) => setTimeout(r, 120));
    expect(eventosEnviados().filter((e) => e.type === 'page_view')).toHaveLength(1);
  });

  it('sin origen la visita va sin propiedades', async () => {
    const { slug } = await publicarFunnel();
    await abrir(slug);
    await esperarEventos(1);
    expect(eventosEnviados()[0]).toEqual({ type: 'page_view', properties: {} });
  });

  it('cada sección que entra en pantalla se cuenta una sola vez; las que salen no cuentan', async () => {
    const { slug } = await publicarFunnel({ blocks: [bloque('encabezado'), bloque('beneficios', 'beneficios', undefined, 2), FORMULARIO] });
    const pantalla = simularIntersectionObserver();
    await abrir(slug);
    await waitFor(() => expect(pantalla.observados().sort()).toEqual(['beneficios', 'encabezado', 'formulario']));
    await pantalla.entrar('encabezado', 'beneficios');
    await pantalla.entrar('beneficios');
    await pantalla.salir('formulario');
    await esperarEventos(3);
    const secciones = eventosEnviados().filter((e) => e.type === 'section_view').map((e) => e.properties?.section);
    expect(secciones.sort()).toEqual(['beneficios', 'encabezado']);
  });

  it('junta los eventos de un rato en una sola petición', async () => {
    tiempos.track = 150;
    const { slug } = await publicarFunnel({ blocks: [bloque('encabezado'), bloque('beneficios', 'beneficios', undefined, 2), FORMULARIO] });
    const pantalla = simularIntersectionObserver();
    await abrir(slug);
    await pantalla.entrar('encabezado', 'beneficios', 'formulario');
    await esperarEventos(4);
    expect(publicService.sendEvents).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publicService.sendEvents).mock.calls[0]![1]).toHaveLength(4);
  });

  it('no manda más de 20 eventos por petición', async () => {
    const muchos = Array.from({ length: 25 }, (_, i) => bloque('boton', `boton-${i + 1}`, { label: `Botón ${i + 1}` }, i + 1));
    const { slug } = await publicarFunnel({ blocks: [...muchos, FORMULARIO] });
    tiempos.track = 150;
    const pantalla = simularIntersectionObserver();
    await abrir(slug);
    await pantalla.entrar(...muchos.map((b) => b.key), 'formulario');
    await esperarEventos(27);
    const lotes = vi.mocked(publicService.sendEvents).mock.calls.map(([, lote]) => lote.length);
    expect(lotes.every((n) => n <= 20)).toBe(true);
    expect(lotes.reduce((a, b) => a + b, 0)).toBe(27);
  });

  it('al ocultarse la página manda lo pendiente de inmediato, con «keepalive»', async () => {
    tiempos.track = 60_000;
    const { slug } = await publicarFunnel();
    await abrir(slug);
    expect(publicService.sendEvents).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(publicService.sendEvents).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publicService.sendEvents).mock.calls[0]![2]).toBe(true);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('volver a mostrar la pestaña no manda nada', async () => {
    tiempos.track = 60_000;
    const { slug } = await publicarFunnel();
    await abrir(slug);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(publicService.sendEvents).not.toHaveBeenCalled();
  });

  it('al cerrar la página manda lo pendiente con «keepalive»', async () => {
    tiempos.track = 60_000;
    const { slug } = await publicarFunnel();
    await abrir(slug);
    window.dispatchEvent(new Event('pagehide'));
    expect(publicService.sendEvents).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publicService.sendEvents).mock.calls[0]![2]).toBe(true);
  });

  it('al salir de la pantalla manda lo pendiente con «keepalive»', async () => {
    tiempos.track = 60_000;
    const { slug } = await publicarFunnel();
    const vista = await abrir(slug);
    vista.unmount();
    expect(publicService.sendEvents).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publicService.sendEvents).mock.calls[0]![2]).toBe(true);
  });

  it('si mandar los eventos falla, la página sigue funcionando', async () => {
    const { slug } = await publicarFunnel();
    vi.mocked(publicService.sendEvents).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    await abrir(slug);
    await waitFor(() => expect(publicService.sendEvents).toHaveBeenCalled());
    await llenarYEnviar();
    expect(await screen.findByRole('heading', { name: '¡Gracias!' })).toBeInTheDocument();
  });

  it('los eventos que se guardan en la demostración son solo de los tipos permitidos', async () => {
    const { slug } = await publicarFunnel();
    vi.mocked(publicService.sendEvents).mockImplementation((await vi.importActual<typeof import('@/services/publicPages')>('@/services/publicPages')).sendEvents);
    await abrir(slug, '?utm_source=tiktok');
    await waitFor(() => expect(leerBaseDeDemostracion().events.length).toBeGreaterThan(0));
    expect(leerBaseDeDemostracion().events.map((e) => e.type)).toEqual(['page_view']);
    expect(leerBaseDeDemostracion().events[0]!.properties).toEqual({ source: 'tiktok' });
  });
});

describe('la pantalla de después de registrarse', () => {
  const enviar = async (objective: Parameters<typeof publicarFunnel>[0] extends infer O ? (O extends { objective?: infer T } ? T : never) : never, extra: Parameters<typeof publicarFunnel>[0] = {}) => {
    const { slug } = await publicarFunnel({ objective, ...extra });
    await abrir(slug);
    await llenarYEnviar();
    return slug;
  };

  it('reemplaza la página: ya no se ve el formulario y se anuncia a los lectores de pantalla', async () => {
    await enviar('leads');
    const pantalla = await screen.findByRole('status');
    expect(within(pantalla).getByRole('heading', { name: '¡Gracias!' })).toBeInTheDocument();
    expect(within(pantalla).getByText('¡Te esperamos!')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Página' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Original Flow' })).not.toBeInTheDocument();
  });

  it('leads con enlace: agradece, lo ofrece y lleva ahí solo después de unos segundos', async () => {
    tiempos.redirect = 400; // margen de sobra para comprobar que todavía no redirigió, aunque la máquina vaya lenta
    const navegar = vi.spyOn(navigation, 'to').mockImplementation(() => undefined);
    await enviar('leads', { typeConfig: { thankYou: { message: '¡Gracias!', redirectUrl: 'https://siguiente.test/paso' } } });
    expect(await screen.findByRole('link', { name: 'Continuar ahora' })).toHaveAttribute('href', 'https://siguiente.test/paso');
    expect(screen.getByText(/te llevamos al siguiente paso/i)).toBeInTheDocument();
    expect(navegar).not.toHaveBeenCalled();
    await waitFor(() => expect(navegar).toHaveBeenCalledWith('https://siguiente.test/paso'));
  });

  it('un enlace de agradecimiento que no es http/https NO se abre ni se ofrece', async () => {
    const navegar = vi.spyOn(navigation, 'to').mockImplementation(() => undefined);
    await enviar('leads', { typeConfig: { thankYou: { message: 'Listo', redirectUrl: 'javascript:alert(1)' } } });
    await screen.findByRole('heading', { name: '¡Gracias!' });
    await new Promise((r) => setTimeout(r, 120));
    expect(screen.queryByRole('link', { name: 'Continuar ahora' })).not.toBeInTheDocument();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('si la persona sale antes, no se la redirige después', async () => {
    tiempos.redirect = 150;
    const navegar = vi.spyOn(navigation, 'to').mockImplementation(() => undefined);
    const { slug } = await publicarFunnel({ typeConfig: { thankYou: { message: 'Listo', redirectUrl: 'https://siguiente.test' } } });
    const vista = await abrir(slug);
    await llenarYEnviar();
    await screen.findByRole('link', { name: 'Continuar ahora' });
    vista.unmount();
    await new Promise((r) => setTimeout(r, 250));
    expect(navegar).not.toHaveBeenCalled();
  });

  it('citas: confirma y ofrece elegir el horario en el calendario', async () => {
    await enviar('citas');
    expect(await screen.findByText('Cita reservada')).toBeInTheDocument();
    const enlace = screen.getByRole('link', { name: 'Elegir mi horario' });
    expect(enlace).toHaveAttribute('href', 'https://cal.test/ana');
    expect(enlace).toHaveAttribute('target', '_blank');
  });

  it('magnet: entrega el mensaje y avisa que la descarga todavía no está disponible', async () => {
    await enviar('magnet');
    expect(await screen.findByText('Aquí está tu guía')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /descargar recurso/i })).toBeDisabled();
    expect(screen.getByText(/la descarga todavía no está disponible/i)).toBeInTheDocument();
  });

  it('webinar: «ya estás registrado» con la fecha en la zona del evento y el enlace para entrar', async () => {
    await enviar('webinar');
    expect(await screen.findByRole('heading', { name: '¡Ya estás registrado!' })).toBeInTheDocument();
    expect(screen.getByText(/2030/)).toBeInTheDocument();
    expect(screen.getByText(/marzo/i)).toBeInTheDocument();
    expect(screen.getByText('(America/Mexico_City)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /entrar al evento/i })).toHaveAttribute('href', 'https://meet.test/evento');
  });

  it('webinar con una zona horaria que el navegador no conoce igual muestra la fecha', async () => {
    await enviar('webinar', { typeConfig: { ...CONFIGS.webinar, timezone: 'Marte/Phobos' } });
    expect(await screen.findByText(/2030/)).toBeInTheDocument();
  });

  it('un enlace de la cita o del evento que no es http/https no se ofrece', async () => {
    for (const objective of ['citas', 'webinar'] as const) {
      const { slug } = await publicarFunnel({ objective, name: `Inseguro ${objective}` });
      editarBaseDeDemostracion((db) => {
        const funnel = db.funnels.find((f: Record<string, any>) => f.slug === slug);
        funnel.typeConfig = { ...funnel.typeConfig, calendarUrl: 'javascript:alert(1)', joinUrl: 'javascript:alert(1)' };
      });
      const { unmount } = await abrir(slug);
      await llenarYEnviar();
      await screen.findByRole('status');
      expect(screen.queryByRole('link', { name: /elegir mi horario|entrar al evento/i }), objective).not.toBeInTheDocument();
      unmount();
    }
  });

  it('aplicación: el mensaje de éxito', async () => {
    await enviar('aplicacion');
    expect(await screen.findByText('Recibimos tu aplicación')).toBeInTheDocument();
  });

  it('el lead queda guardado antes de mostrar la pantalla de gracias', async () => {
    await enviar('leads');
    await screen.findByRole('heading', { name: '¡Gracias!' });
    expect(leerBaseDeDemostracion().leads).toHaveLength(1);
  });
});

describe('la dirección pública desde el editor', () => {
  it('el enlace que muestra «Publicar» abre justo esta página', async () => {
    const { slug } = await publicarFunnel();
    const { publicPath } = await import('@/shared/utils/publicUrl');
    expect(publicPath(slug)).toBe(`/p/${slug}`);
    await abrir(slug);
  });

  it('cambiar el slug de un funnel publicado mueve su dirección', async () => {
    const { slug, token, funnel } = await publicarFunnel();
    await updateFunnel(token, funnel.id, { slug: 'direccion-nueva' });
    montar(`/p/${slug}`);
    expect(await screen.findByRole('heading', { name: /esta página no está disponible/i })).toBeInTheDocument();
    await abrir('direccion-nueva');
  });
});
