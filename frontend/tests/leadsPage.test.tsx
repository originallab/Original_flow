import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api';
import * as leadsService from '@/services/leads';
import { editarBaseDeDemostracion, leerBaseDeDemostracion } from './helpers/publicApp';
import { negocioConLeads, type SeedLead } from './helpers/leadsApp';
import { montar } from './helpers/renderApp';

const tiempos = vi.hoisted(() => ({ buscar: 20 }));
vi.mock('@/features/leads/constants', () => ({
  get SEARCH_DELAY_MS() {
    return tiempos.buscar;
  },
}));
vi.mock('@/services/leads', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/leads')>();
  return { ...original, listLeads: vi.fn(original.listLeads), listLeadStages: vi.fn(original.listLeadStages), updateLead: vi.fn(original.updateLead) };
});

beforeEach(() => {
  tiempos.buscar = 20;
  for (const fn of [leadsService.listLeads, leadsService.listLeadStages, leadsService.updateLead]) vi.mocked(fn).mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const ETAPAS = ['Nuevo', 'Contactado', 'Interesado', 'Oportunidad', 'Cliente'];
const MARIA: SeedLead = { name: 'María Pérez', email: 'maria@correo.com', phone: '55 1234 5678', utm: { utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'octubre' }, customFields: { mensaje: 'Quiero aprender datos' } };
const LUIS: SeedLead = { name: 'Luis Torres', email: 'luis@correo.com', funnel: 1 };
const ANA: SeedLead = { email: 'ana.sin.nombre@correo.com', utm: { referrer: 'https://www.google.com/search?q=datos' } };

const columna = (nombre: string) => screen.getByRole('region', { name: nombre });
const tarjetas = (nombre: string) => within(columna(nombre)).queryAllByRole('listitem');
/** Los títulos de las tarjetas de una columna, de arriba abajo. */
const nombresEn = (nombre: string) => tarjetas(nombre).map((li) => within(li).getByRole('button').querySelector('span')?.textContent ?? '');
const tarjeta = (texto: string | RegExp) => screen.getByRole('button', { name: texto }).closest('li') as HTMLElement;

async function abrirTablero() {
  const vista = montar('/leads');
  await screen.findByRole('region', { name: 'Nuevo' });
  return vista;
}
const dataTransfer = () => ({ setData: vi.fn(), getData: vi.fn(), effectAllowed: '', dropEffect: '' });
/** Arrastra una tarjeta a una columna, con los eventos que lanza el navegador. */
function arrastrar(li: HTMLElement, destino: string) {
  const dt = dataTransfer();
  fireEvent.dragStart(li, { dataTransfer: dt });
  fireEvent.dragOver(columna(destino), { dataTransfer: dt });
  fireEvent.drop(columna(destino), { dataTransfer: dt });
  fireEvent.dragEnd(li, { dataTransfer: dt });
}

describe('acceso a la pantalla', () => {
  it('«Leads» está en el menú y la pantalla se abre desde ahí', async () => {
    await negocioConLeads([MARIA]);
    const { router } = montar('/funnels');
    await userEvent.click((await screen.findAllByRole('link', { name: 'Leads' }))[0]!);
    expect(router.state.location.pathname).toBe('/leads');
    expect(await screen.findByRole('heading', { level: 1, name: 'Leads' })).toBeInTheDocument();
  });

  it.each(['super_admin', 'client_admin', 'marketing_manager', 'vendedor', 'analista'])('el rol %s ve el menú y el tablero', async (rol) => {
    await negocioConLeads([MARIA], { role: rol });
    montar('/leads');
    await screen.findByRole('region', { name: 'Nuevo' });
    expect(screen.getAllByRole('link', { name: 'Leads' }).length).toBeGreaterThan(0);
  });

  it('el diseñador no ve «Leads» en el menú y, si entra por la dirección, solo ve un aviso y no se piden los leads', async () => {
    await negocioConLeads([MARIA], { role: 'disenador' });
    montar('/leads');
    expect(await screen.findByRole('alert')).toHaveTextContent(/tu rol no tiene acceso a los leads/i);
    expect(screen.queryByRole('link', { name: 'Leads' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(leadsService.listLeads).not.toHaveBeenCalled();
    expect(leadsService.listLeadStages).not.toHaveBeenCalled();
  });

  it('sin sesión manda a entrar', async () => {
    const { router } = montar('/leads');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});

describe('el tablero', () => {
  it('mientras carga dice «Cargando tus leads…»', async () => {
    await negocioConLeads([MARIA]);
    // La carga se deja pendiente a propósito: en la demostración terminaría casi al instante y el aviso no se alcanzaría a ver.
    const real = (await vi.importActual<typeof import('@/services/leads')>('@/services/leads')).listLeads;
    let soltar: () => void = () => undefined;
    vi.mocked(leadsService.listLeads).mockImplementationOnce((token, workspaceId, filters, signal) => new Promise((resolver) => (soltar = () => resolver(real(token, workspaceId, filters, signal)))));
    montar('/leads');
    expect(await screen.findByText('Cargando tus leads…')).toBeInTheDocument();
    await waitFor(() => expect(leadsService.listLeads).toHaveBeenCalled()); // el efecto pide los datos un instante después de dibujar
    soltar();
    await screen.findByRole('region', { name: 'Nuevo' });
    expect(screen.queryByText('Cargando tus leads…')).not.toBeInTheDocument();
  });

  it('una columna por etapa, en su orden, con cuántos leads tiene cada una', async () => {
    await negocioConLeads([MARIA, LUIS, ANA]);
    await abrirTablero();
    expect(screen.getAllByRole('region').map((r) => within(r).getByRole('heading').textContent)).toEqual(ETAPAS);
    expect(within(columna('Nuevo')).getByText('3')).toBeInTheDocument();
    expect(within(columna('Contactado')).getByText('0')).toBeInTheDocument();
    expect(within(columna('Cliente')).getByText('0')).toBeInTheDocument();
  });

  it('los leads nuevos entran en la primera etapa, del más nuevo al más viejo', async () => {
    await negocioConLeads([MARIA, LUIS, ANA]);
    await abrirTablero();
    expect(tarjetas('Nuevo')).toHaveLength(3);
    expect(nombresEn('Nuevo')).toEqual(['ana.sin.nombre@correo.com', 'Luis Torres', 'María Pérez']);
    expect(within(columna('Contactado')).getByText('Arrastra un lead aquí.')).toBeInTheDocument();
  });

  it('cada tarjeta dice quién es, cómo contactarle, de qué funnel y de dónde llegó', async () => {
    await negocioConLeads([MARIA, LUIS, ANA]);
    await abrirTablero();
    const maria = tarjeta(/María Pérez/);
    expect(within(maria).getByText('maria@correo.com')).toBeInTheDocument();
    expect(within(maria).getByText('55 1234 5678')).toBeInTheDocument();
    expect(within(maria).getByText('Curso de datos')).toBeInTheDocument();
    expect(within(maria).getByText('instagram')).toBeInTheDocument();
    expect(within(maria).getByText('hace un momento')).toBeInTheDocument();
    expect(within(tarjeta(/Luis Torres/)).getByText('Taller de ventas')).toBeInTheDocument();
    expect(within(tarjeta(/Luis Torres/)).getByText('Directo')).toBeInTheDocument();
  });

  it('sin nombre usa el correo como título (sin repetirlo) y el origen es el sitio de donde llegó', async () => {
    await negocioConLeads([ANA]);
    await abrirTablero();
    const li = tarjeta(/ana\.sin\.nombre@correo\.com/);
    expect(within(li).getAllByText('ana.sin.nombre@correo.com')).toHaveLength(1);
    expect(within(li).getByText('www.google.com')).toBeInTheDocument();
  });

  it('un lead sin ningún dato de contacto se llama «Sin nombre»', async () => {
    await negocioConLeads([MARIA]);
    editarBaseDeDemostracion((db) => {
      delete db.leads[0].name;
      delete db.leads[0].email;
      delete db.leads[0].phone;
    });
    await abrirTablero();
    expect(screen.getByRole('button', { name: /Sin nombre/ })).toBeInTheDocument();
  });

  it('lo que escribió la persona se muestra como texto, nunca como HTML', async () => {
    await negocioConLeads([{ ...MARIA, name: '<img src=x onerror=alert(1)> María' }]);
    const { container } = await abrirTablero();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(screen.getByRole('button', { name: /<img src=x onerror=alert\(1\)> María/ })).toBeInTheDocument();
  });

  it('sin leads explica cuándo aparecerán y lleva a los funnels', async () => {
    await negocioConLeads([]);
    const { router } = montar('/leads');
    expect(await screen.findByRole('heading', { name: 'Todavía no tienes leads' })).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Ver mis funnels' }));
    expect(router.state.location.pathname).toBe('/funnels');
  });

  it('si no se pueden cargar avisa y deja reintentar', async () => {
    await negocioConLeads([MARIA]);
    vi.mocked(leadsService.listLeads).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    montar('/leads');
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar tus leads/i);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('region', { name: 'Nuevo' });
    expect(tarjetas('Nuevo')).toHaveLength(1);
  });

  it('si falla cargar las etapas también avisa', async () => {
    await negocioConLeads([MARIA]);
    vi.mocked(leadsService.listLeadStages).mockRejectedValueOnce(new ApiError(500, 'UNKNOWN_ERROR', 'Error'));
    montar('/leads');
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar tus leads/i);
  });

  it('con más de 100 leads muestra los 100 más recientes y lo dice', async () => {
    await negocioConLeads([MARIA]);
    editarBaseDeDemostracion((db) => {
      const base = db.leads[0];
      for (let i = 1; i < 105; i++) db.leads.push({ ...base, id: `extra-${i}`, name: `Lead ${i}`, createdAt: new Date(Date.now() - i * 60_000).toISOString() });
    });
    await abrirTablero();
    expect(await screen.findByText(/mostrando los 100 leads más recientes de 105/i)).toBeInTheDocument();
    expect(tarjetas('Nuevo')).toHaveLength(100);
    expect(within(columna('Nuevo')).getByText('100')).toBeInTheDocument();
  });

  it('solo se ven los leads del negocio activo', async () => {
    await negocioConLeads([MARIA]);
    editarBaseDeDemostracion((db) => {
      db.workspaces.push({ ...db.workspaces[0], id: 'otro-negocio', name: 'Otro negocio' });
      db.funnels.push({ ...db.funnels[0], id: 'funnel-ajeno', workspaceId: 'otro-negocio', slug: 'ajeno', name: 'Funnel ajeno' });
      db.leads.push({ ...db.leads[0], id: 'lead-ajeno', funnelId: 'funnel-ajeno', name: 'Lead del otro negocio' });
    });
    await abrirTablero();
    expect(screen.queryByText(/Lead del otro negocio/)).not.toBeInTheDocument();
    expect(tarjetas('Nuevo')).toHaveLength(1);
  });
});

describe('filtros', () => {
  it('el funnel deja solo sus leads y «Todos» los devuelve', async () => {
    await negocioConLeads([MARIA, LUIS, ANA]);
    await abrirTablero();
    const filtro = screen.getByLabelText('Funnel');
    const opciones = within(filtro).getAllByRole('option').map((o) => o.textContent);
    expect(opciones[0]).toBe('Todos');
    expect(opciones.slice(1).sort()).toEqual(['Curso de datos', 'Taller de ventas']);
    await userEvent.selectOptions(filtro, 'Taller de ventas');
    await waitFor(() => expect(tarjetas('Nuevo')).toHaveLength(1));
    expect(screen.getByRole('button', { name: /Luis Torres/ })).toBeInTheDocument();
    expect(vi.mocked(leadsService.listLeads).mock.calls.at(-1)![2]).toMatchObject({ funnelId: expect.any(String) });
    await userEvent.selectOptions(filtro, 'Todos');
    await waitFor(() => expect(tarjetas('Nuevo')).toHaveLength(3));
  });

  it('el buscador espera a que termines de escribir y busca en nombre, correo y teléfono', async () => {
    tiempos.buscar = 120;
    await negocioConLeads([MARIA, LUIS, ANA]);
    await abrirTablero();
    const llamadas = vi.mocked(leadsService.listLeads).mock.calls.length;
    await userEvent.type(screen.getByLabelText('Buscar'), 'luis@');
    expect(vi.mocked(leadsService.listLeads).mock.calls).toHaveLength(llamadas); // todavía no pidió nada
    await waitFor(() => expect(tarjetas('Nuevo')).toHaveLength(1));
    expect(vi.mocked(leadsService.listLeads).mock.calls).toHaveLength(llamadas + 1); // una sola petición para todas las teclas
    expect(vi.mocked(leadsService.listLeads).mock.calls.at(-1)![2]).toMatchObject({ q: 'luis@' });
    expect(screen.getByRole('button', { name: /Luis Torres/ })).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Buscar'));
    await userEvent.type(screen.getByLabelText('Buscar'), '1234');
    await waitFor(() => expect(nombresEn('Nuevo')).toEqual(['María Pérez']));
  });

  it('al buscar sigue viéndose el tablero y, si nada coincide, lo dice sin mostrar el aviso de «sin leads»', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    await userEvent.type(screen.getByLabelText('Buscar'), 'nadie');
    expect(await screen.findByText('Ningún lead coincide con tu búsqueda.')).toBeInTheDocument();
    expect(screen.queryByText('Cargando tus leads…')).not.toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(5);
    expect(screen.queryByRole('heading', { name: 'Todavía no tienes leads' })).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Buscar'));
    await waitFor(() => expect(tarjetas('Nuevo')).toHaveLength(1));
    expect(screen.queryByText('Ningún lead coincide con tu búsqueda.')).not.toBeInTheDocument();
  });

  it('el texto de la búsqueda no se manda con espacios de más', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    await userEvent.type(screen.getByLabelText('Buscar'), '  maría  ');
    await waitFor(() => expect(vi.mocked(leadsService.listLeads).mock.calls.at(-1)![2]).toMatchObject({ q: '  maría  ' }));
    await waitFor(() => expect(tarjetas('Nuevo')).toHaveLength(1));
  });
});

describe('mover un lead de etapa arrastrándolo', () => {
  it('al soltarlo en otra columna pasa a ella y queda guardado', async () => {
    await negocioConLeads([MARIA, LUIS]);
    await abrirTablero();
    arrastrar(tarjeta(/María Pérez/), 'Contactado');
    await waitFor(() => expect(nombresEn('Contactado')).toEqual([expect.stringContaining('María Pérez')]));
    expect(nombresEn('Nuevo')).toEqual([expect.stringContaining('Luis Torres')]);
    expect(within(columna('Contactado')).getByText('1')).toBeInTheDocument();
    await waitFor(() => expect(leadsService.updateLead).toHaveBeenCalledTimes(1));
    const [, , cambios] = vi.mocked(leadsService.updateLead).mock.calls[0]!;
    const { leads, leadStages } = leerBaseDeDemostracion();
    expect(cambios).toEqual({ leadStageId: leadStages.find((e) => e.name === 'Contactado')!.id });
    expect(leads.find((l) => l.name === 'María Pérez')!.leadStageId).toBe(cambios.leadStageId);
    expect(leads.find((l) => l.name === 'Luis Torres')!.leadStageId).toBe(leadStages.find((e) => e.name === 'Nuevo')!.id);
  });

  it('se queda donde la dejaste al volver a abrir el tablero', async () => {
    await negocioConLeads([MARIA]);
    const { unmount } = await abrirTablero();
    arrastrar(tarjeta(/María Pérez/), 'Oportunidad');
    await waitFor(() => expect(leadsService.updateLead).toHaveBeenCalled());
    await waitFor(() => expect(nombresEn('Oportunidad')).toHaveLength(1));
    unmount();
    await abrirTablero();
    expect(nombresEn('Oportunidad')).toEqual([expect.stringContaining('María Pérez')]);
    expect(tarjetas('Nuevo')).toHaveLength(0);
  });

  it('la columna sobre la que se arrastra se resalta y deja de resaltarse al soltar', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const dt = dataTransfer();
    fireEvent.dragStart(tarjeta(/María Pérez/), { dataTransfer: dt });
    fireEvent.dragOver(columna('Interesado'), { dataTransfer: dt });
    expect(columna('Interesado').className).toContain('border-violet');
    expect(columna('Nuevo').className).not.toContain('border-violet');
    fireEvent.dragEnd(tarjeta(/María Pérez/), { dataTransfer: dt });
    expect(columna('Interesado').className).not.toContain('border-violet');
  });

  it('soltarlo en la misma columna no pide nada al servidor', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    arrastrar(tarjeta(/María Pérez/), 'Nuevo');
    await new Promise((r) => setTimeout(r, 50));
    expect(leadsService.updateLead).not.toHaveBeenCalled();
    expect(tarjetas('Nuevo')).toHaveLength(1);
  });

  it('si el servidor lo rechaza, el lead vuelve a su columna y se avisa', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    vi.mocked(leadsService.updateLead).mockRejectedValueOnce(new ApiError(500, 'UNKNOWN_ERROR', 'Error'));
    arrastrar(tarjeta(/María Pérez/), 'Contactado');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo mover el lead. Inténtalo de nuevo.');
    expect(nombresEn('Nuevo')).toEqual([expect.stringContaining('María Pérez')]);
    expect(tarjetas('Contactado')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un movimiento que sale bien quita el aviso del anterior', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    vi.mocked(leadsService.updateLead).mockRejectedValueOnce(new ApiError(500, 'UNKNOWN_ERROR', 'Error'));
    arrastrar(tarjeta(/María Pérez/), 'Contactado');
    await screen.findByRole('alert');
    arrastrar(tarjeta(/María Pérez/), 'Contactado');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() => expect(nombresEn('Contactado')).toHaveLength(1));
  });

  it('si se mueve dos veces seguidas, gana la última aunque la primera respuesta llegue después', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const real = (await vi.importActual<typeof import('@/services/leads')>('@/services/leads')).updateLead;
    const etapas = leerBaseDeDemostracion().leadStages;
    let soltarLaPrimera: () => void = () => undefined;
    const lead = (await vi.importActual<typeof import('@/services/leads')>('@/services/leads')).listLeads;
    vi.mocked(leadsService.updateLead).mockImplementationOnce(
      (token, id) =>
        new Promise((resolver) => {
          soltarLaPrimera = () => lead(token, leerBaseDeDemostracion().workspaces[0]!.id).then((p) => resolver({ ...p.items.find((l) => l.id === id)!, leadStageId: etapas.find((e) => e.name === 'Contactado')!.id }));
        }),
    );
    vi.mocked(leadsService.updateLead).mockImplementationOnce(real);
    arrastrar(tarjeta(/María Pérez/), 'Contactado'); // la respuesta tarda
    arrastrar(tarjeta(/María Pérez/), 'Interesado'); // esta responde enseguida
    await waitFor(() => expect(nombresEn('Interesado')).toHaveLength(1));
    soltarLaPrimera();
    await new Promise((r) => setTimeout(r, 60));
    expect(nombresEn('Interesado')).toEqual([expect.stringContaining('María Pérez')]);
    expect(tarjetas('Contactado')).toHaveLength(0);
  });

  it('si el primer movimiento falla cuando el segundo ya salió bien, no se deshace el nuevo ni se avisa', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const real = (await vi.importActual<typeof import('@/services/leads')>('@/services/leads')).updateLead;
    let fallarLaPrimera: () => void = () => undefined;
    vi.mocked(leadsService.updateLead).mockImplementationOnce(
      () =>
        new Promise((_, rechazar) => {
          fallarLaPrimera = () => rechazar(new ApiError(500, 'UNKNOWN_ERROR', 'Error'));
        }),
    );
    vi.mocked(leadsService.updateLead).mockImplementationOnce(real);
    arrastrar(tarjeta(/María Pérez/), 'Contactado'); // esta falla, pero tarde
    arrastrar(tarjeta(/María Pérez/), 'Interesado'); // esta responde enseguida
    await waitFor(() => expect(nombresEn('Interesado')).toHaveLength(1));
    fallarLaPrimera();
    await new Promise((r) => setTimeout(r, 60));
    expect(nombresEn('Interesado')).toEqual([expect.stringContaining('María Pérez')]);
    expect(tarjetas('Nuevo')).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('el analista solo mira: las tarjetas no se arrastran y soltar no mueve nada', async () => {
    await negocioConLeads([MARIA], { role: 'analista' });
    await abrirTablero();
    expect(tarjeta(/María Pérez/)).toHaveAttribute('draggable', 'false');
    expect(within(columna('Contactado')).getByText('Sin leads.')).toBeInTheDocument();
    arrastrar(tarjeta(/María Pérez/), 'Contactado');
    await new Promise((r) => setTimeout(r, 50));
    expect(leadsService.updateLead).not.toHaveBeenCalled();
    expect(tarjetas('Nuevo')).toHaveLength(1);
  });

  it('el vendedor sí puede moverlos', async () => {
    await negocioConLeads([MARIA], { role: 'vendedor' });
    await abrirTablero();
    expect(tarjeta(/María Pérez/)).toHaveAttribute('draggable', 'true');
    arrastrar(tarjeta(/María Pérez/), 'Cliente');
    await waitFor(() => expect(nombresEn('Cliente')).toHaveLength(1));
  });
});

describe('el detalle de un lead', () => {
  const abrirDetalle = async (nombre: string | RegExp = /María Pérez/) => {
    await userEvent.click(screen.getByRole('button', { name: nombre }));
    return screen.findByRole('dialog');
  };

  it('muestra todo lo que se sabe, con enlaces para escribir y llamar', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const detalle = await abrirDetalle();
    expect(within(detalle).getByRole('heading', { name: 'María Pérez' })).toBeInTheDocument();
    expect(within(detalle).getByRole('link', { name: 'maria@correo.com' })).toHaveAttribute('href', 'mailto:maria@correo.com');
    expect(within(detalle).getByRole('link', { name: '55 1234 5678' })).toHaveAttribute('href', 'tel:5512345678');
    expect(within(detalle).getByText('Curso de datos')).toBeInTheDocument();
    expect(within(detalle).getByText('instagram')).toBeInTheDocument();
    expect(within(detalle).getByText('bio · octubre')).toBeInTheDocument();
    expect(within(detalle).getByText('Mensaje')).toBeInTheDocument();
    expect(within(detalle).getByText('Quiero aprender datos')).toBeInTheDocument();
    expect(within(detalle).getByText(/2026/)).toBeInTheDocument();
  });

  it('no enseña los campos internos', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const detalle = await abrirDetalle();
    expect(detalle.textContent).not.toMatch(/_consentAt|consentat/i);
  });

  it('un correo o teléfono con forma rara se muestra como texto, no como enlace', async () => {
    await negocioConLeads([MARIA]);
    editarBaseDeDemostracion((db) => {
      db.leads[0].email = 'a@b.com?cc=victima@x.com&body=hola';
      db.leads[0].phone = '55 1234 5678';
    });
    await abrirTablero();
    const detalle = await abrirDetalle();
    expect(within(detalle).getByText('a@b.com?cc=victima@x.com&body=hola')).toBeInTheDocument();
    expect(within(detalle).queryByRole('link', { name: /a@b\.com/ })).not.toBeInTheDocument();
    expect(detalle.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('un lead sin correo ni teléfono muestra una raya', async () => {
    await negocioConLeads([{ name: 'Solo Nombre', phone: '55 1234 5678' }]);
    await abrirTablero();
    const detalle = await abrirDetalle(/Solo Nombre/);
    const fila = within(detalle).getByText('Correo').parentElement!;
    expect(fila).toHaveTextContent('—');
  });

  it('se cierra con Escape, con la X y haciendo clic afuera', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    await abrirDetalle();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await abrirDetalle();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cambiarle la etapa desde el detalle la mueve en el tablero y queda guardada', async () => {
    await negocioConLeads([MARIA, LUIS]);
    await abrirTablero();
    const detalle = await abrirDetalle();
    const etapa = within(detalle).getByLabelText('Etapa');
    expect(within(etapa).getAllByRole('option').map((o) => o.textContent)).toEqual(ETAPAS);
    expect(etapa).toHaveValue(leerBaseDeDemostracion().leadStages.find((e) => e.name === 'Nuevo')!.id);
    await userEvent.selectOptions(etapa, 'Interesado');
    await waitFor(() => expect(nombresEn('Interesado')).toEqual([expect.stringContaining('María Pérez')]));
    expect(within(detalle).getByLabelText('Etapa')).toHaveDisplayValue('Interesado');
    expect(leerBaseDeDemostracion().leads.find((l) => l.name === 'María Pérez')!.leadStageId).toBe(leerBaseDeDemostracion().leadStages.find((e) => e.name === 'Interesado')!.id);
  });

  it('si no se pudo cambiar la etapa, el selector vuelve a la anterior y se avisa', async () => {
    await negocioConLeads([MARIA]);
    await abrirTablero();
    const detalle = await abrirDetalle();
    vi.mocked(leadsService.updateLead).mockRejectedValueOnce(new ApiError(500, 'UNKNOWN_ERROR', 'Error'));
    await userEvent.selectOptions(within(detalle).getByLabelText('Etapa'), 'Cliente');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo mover el lead.');
    expect(within(detalle).getByLabelText('Etapa')).toHaveDisplayValue('Nuevo');
  });

  describe('valor estimado', () => {
    it('se guarda, se avisa y se ve en la tarjeta', async () => {
      await negocioConLeads([MARIA]);
      await abrirTablero();
      const detalle = await abrirDetalle();
      await userEvent.type(within(detalle).getByLabelText('Valor estimado'), '1500.5');
      await userEvent.click(within(detalle).getByRole('button', { name: 'Guardar' }));
      expect(await within(detalle).findByText('Valor guardado.')).toBeInTheDocument();
      expect(leerBaseDeDemostracion().leads[0]!.value).toBe(1500.5);
      expect(within(tarjeta(/María Pérez/)).getByText('1500,5')).toBeInTheDocument();
    });

    it('escribir de nuevo quita el aviso de «guardado»', async () => {
      await negocioConLeads([MARIA]);
      await abrirTablero();
      const detalle = await abrirDetalle();
      await userEvent.type(within(detalle).getByLabelText('Valor estimado'), '10');
      await userEvent.click(within(detalle).getByRole('button', { name: 'Guardar' }));
      await within(detalle).findByText('Valor guardado.');
      await userEvent.type(within(detalle).getByLabelText('Valor estimado'), '5');
      expect(within(detalle).queryByText('Valor guardado.')).not.toBeInTheDocument();
    });

    it('vaciarlo lo borra', async () => {
      await negocioConLeads([MARIA]);
      editarBaseDeDemostracion((db) => {
        db.leads[0].value = 100;
      });
      await abrirTablero();
      expect(within(tarjeta(/María Pérez/)).getByText('100')).toBeInTheDocument();
      const detalle = await abrirDetalle();
      expect(within(detalle).getByLabelText('Valor estimado')).toHaveValue(100);
      await userEvent.clear(within(detalle).getByLabelText('Valor estimado'));
      await userEvent.click(within(detalle).getByRole('button', { name: 'Guardar' }));
      await within(detalle).findByText('Valor guardado.');
      expect(leerBaseDeDemostracion().leads[0]!.value).toBeNull();
      expect(within(tarjeta(/María Pérez/)).queryByText('100')).not.toBeInTheDocument();
    });

    it('un valor negativo se marca en el campo y no se manda', async () => {
      await negocioConLeads([MARIA]);
      await abrirTablero();
      const detalle = await abrirDetalle();
      await userEvent.type(within(detalle).getByLabelText('Valor estimado'), '-5');
      await userEvent.click(within(detalle).getByRole('button', { name: 'Guardar' }));
      expect(within(detalle).getByText('Escribe un número mayor o igual a 0.')).toBeInTheDocument();
      expect(within(detalle).getByLabelText('Valor estimado')).toBeInvalid();
      expect(leadsService.updateLead).not.toHaveBeenCalled();
    });

    it('el error de validación del servidor se muestra junto al campo', async () => {
      await negocioConLeads([MARIA]);
      await abrirTablero();
      const detalle = await abrirDetalle();
      vi.mocked(leadsService.updateLead).mockRejectedValueOnce(new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'value', message: 'Debe ser un número entre 0 y 9999999999.99' }], 'r'));
      await userEvent.type(within(detalle).getByLabelText('Valor estimado'), '5');
      await userEvent.click(within(detalle).getByRole('button', { name: 'Guardar' }));
      expect(await within(detalle).findByText('Debe ser un número entre 0 y 9999999999.99')).toBeInTheDocument();
      expect(within(detalle).getByRole('button', { name: 'Guardar' })).toBeEnabled();
    });

    it('cualquier otro error se explica y se puede reintentar', async () => {
      await negocioConLeads([MARIA]);
      await abrirTablero();
      const detalle = await abrirDetalle();
      vi.mocked(leadsService.updateLead).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
      await userEvent.type(within(detalle).getByLabelText('Valor estimado'), '5');
      await userEvent.click(within(detalle).getByRole('button', { name: 'Guardar' }));
      expect(await within(detalle).findByText('No se pudo guardar. Inténtalo de nuevo.')).toBeInTheDocument();
      await userEvent.click(within(detalle).getByRole('button', { name: 'Guardar' }));
      expect(await within(detalle).findByText('Valor guardado.')).toBeInTheDocument();
    });

    it('mientras guarda el botón dice «Guardando…» y no se manda dos veces', async () => {
      await negocioConLeads([MARIA]);
      await abrirTablero();
      const detalle = await abrirDetalle();
      vi.mocked(leadsService.updateLead).mockImplementationOnce(() => new Promise(() => undefined));
      await userEvent.type(within(detalle).getByLabelText('Valor estimado'), '5');
      await userEvent.click(within(detalle).getByRole('button', { name: 'Guardar' }));
      const boton = await within(detalle).findByRole('button', { name: 'Guardando…' });
      expect(boton).toBeDisabled();
      fireEvent.submit(boton.closest('form')!);
      expect(leadsService.updateLead).toHaveBeenCalledTimes(1);
    });
  });

  it('el analista ve la etapa y el valor, pero no puede cambiarlos', async () => {
    await negocioConLeads([MARIA], { role: 'analista' });
    editarBaseDeDemostracion((db) => {
      db.leads[0].value = 250;
    });
    await abrirTablero();
    const detalle = await abrirDetalle();
    expect(within(detalle).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(detalle).queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(within(detalle).queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(within(detalle).getByText('Nuevo')).toBeInTheDocument();
    expect(within(detalle).getByText('250')).toBeInTheDocument();
  });

  it('si el lead desaparece de la lista (por un filtro) el detalle se cierra', async () => {
    await negocioConLeads([MARIA, LUIS]);
    await abrirTablero();
    await abrirDetalle(/María Pérez/);
    // El detalle bloquea el resto de la pantalla: se cambia el filtro «por debajo», como lo haría otra pestaña.
    fireEvent.change(screen.getByLabelText('Funnel'), { target: { value: leerBaseDeDemostracion().funnels.find((f) => f.name === 'Taller de ventas')!.id } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
