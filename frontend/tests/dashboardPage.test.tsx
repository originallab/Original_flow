import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as analytics from '@/services/analytics';
import { ApiError } from '@/services/api';
import { createFunnel, saveContent } from '@/services/funnels';
import { editarBaseDeDemostracion, bloque, FORMULARIO } from './helpers/publicApp';
import { negocioConLeads, sembrarEvento, sembrarLead } from './helpers/leadsApp';
import { montar } from './helpers/renderApp';

vi.mock('@/services/analytics', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/analytics')>();
  return {
    ...original,
    getSummary: vi.fn(original.getSummary),
    getFunnelConversion: vi.fn(original.getFunnelConversion),
    getSources: vi.fn(original.getSources),
    getDropOff: vi.fn(original.getDropOff),
    getFunnelsPerformance: vi.fn(original.getFunnelsPerformance),
  };
});

const llamadas = [analytics.getSummary, analytics.getFunnelConversion, analytics.getSources, analytics.getDropOff, analytics.getFunnelsPerformance];

beforeEach(() => {
  for (const fn of llamadas) vi.mocked(fn).mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const resumen = () => screen.getByRole('list', { name: 'Resumen del periodo' });
const tile = (nombre: string) => within(resumen()).getAllByRole('listitem').find((li) => within(li).queryByText(nombre) !== null) as HTMLElement;
const tarjeta = (titulo: string) => screen.getByRole('region', { name: titulo });
const filas = (region: HTMLElement) => within(region).getAllByRole('row').slice(1);
const fila = (region: HTMLElement, nombre: string | RegExp) => filas(region).find((row) => within(row).queryByRole('rowheader', { name: nombre }) !== null) as HTMLElement;
const celdas = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent ?? '');
const anchoDeBarra = (row: HTMLElement) => (row.querySelector('div[title]')!.firstElementChild as HTMLElement).style.width;
const colorDeBarra = (row: HTMLElement) => (row.querySelector('div[title]')!.firstElementChild as HTMLElement).style.background;

async function abrir() {
  const vista = montar('/');
  await screen.findByRole('list', { name: 'Resumen del periodo' });
  return vista;
}

/** Visitas, leads y su periodo anterior (de 30 a 60 días) para el primer funnel. */
function actividadBasica(funnelId: string) {
  sembrarEvento(funnelId, 'page_view', 2, {}, 10);
  sembrarLead(funnelId, 3, {}, 4);
  sembrarEvento(funnelId, 'page_view', 40, {}, 5);
  sembrarLead(funnelId, 45, {}, 1);
}

describe('el dashboard', () => {
  it('saluda, dice de qué negocio habla y mientras carga lo avisa', async () => {
    await negocioConLeads([]);
    // La carga se deja pendiente a propósito: en la demostración terminaría casi al instante y el aviso no se alcanzaría a ver.
    const real = (await vi.importActual<typeof import('@/services/analytics')>('@/services/analytics')).getSummary;
    let soltar: () => void = () => undefined;
    vi.mocked(analytics.getSummary).mockImplementationOnce((token, query, signal) => new Promise((resolver) => (soltar = () => resolver(real(token, query, signal)))));
    montar('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument();
    expect(screen.getByText('Academia Nimbral', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Cargando tu dashboard…')).toBeInTheDocument();
    await waitFor(() => expect(analytics.getSummary).toHaveBeenCalled()); // el efecto pide los datos un instante después de dibujar
    soltar();
    await screen.findByRole('list', { name: 'Resumen del periodo' });
    expect(screen.queryByText('Cargando tu dashboard…')).not.toBeInTheDocument();
  });

  describe('las cifras del periodo', () => {
    it('visitas, leads y conversión, cada una con su cambio frente al periodo anterior', async () => {
      const { funnels } = await negocioConLeads([]);
      actividadBasica(funnels[0].id);
      await abrir();
      expect(tile('Visitas')).toHaveTextContent('10');
      expect(tile('Visitas')).toHaveTextContent('+100 %');
      expect(tile('Visitas')).toHaveTextContent('vs. periodo anterior');
      expect(tile('Leads')).toHaveTextContent('4');
      expect(tile('Leads')).toHaveTextContent('+300 %');
      expect(tile('Conversión')).toHaveTextContent('40 %');
      expect(tile('Conversión')).toHaveTextContent('+20 pts');
    });

    it('cuando baja lo dice con el signo menos, y no solo con el color', async () => {
      const { funnels } = await negocioConLeads([]);
      sembrarEvento(funnels[0].id, 'page_view', 2, {}, 2);
      sembrarEvento(funnels[0].id, 'page_view', 40, {}, 4);
      await abrir();
      expect(tile('Visitas')).toHaveTextContent('−50 %');
      expect(tile('Visitas').querySelector('svg')).not.toBeNull(); // la flecha
    });

    it('«Sin cambios», «Nuevo» y la raya cuando no hay con qué comparar', async () => {
      const { funnels } = await negocioConLeads([]);
      sembrarEvento(funnels[0].id, 'page_view', 2, {}, 5);
      sembrarEvento(funnels[0].id, 'page_view', 40, {}, 5);
      sembrarLead(funnels[0].id, 2, {}, 3); // antes no había leads
      await abrir();
      expect(tile('Visitas')).toHaveTextContent('Sin cambios');
      expect(tile('Leads')).toHaveTextContent('Nuevo');
    });

    it('sin nada en los dos periodos muestra ceros y una raya, sin «vs. periodo anterior»', async () => {
      await negocioConLeads([]);
      await abrir();
      expect(tile('Visitas')).toHaveTextContent('0');
      expect(tile('Visitas')).toHaveTextContent('—');
      expect(tile('Visitas')).not.toHaveTextContent('vs. periodo anterior');
      expect(tile('Conversión')).toHaveTextContent('0 %');
    });

    it('los números grandes se compactan', async () => {
      await negocioConLeads([]);
      vi.mocked(analytics.getSummary).mockResolvedValue({ visits: { value: 12_345, previous: 10_000 }, leads: { value: 20, previous: 20 }, conversion: { value: 0.2, previous: 0.2 }, revenue: [], averageTicket: [] });
      await abrir();
      expect(tile('Visitas')).toHaveTextContent(/12,3\smil/);
    });

    it('sin pagos, Ingresos y Ticket promedio dicen que llegan con los pagos', async () => {
      await negocioConLeads([]);
      await abrir();
      for (const nombre of ['Ingresos', 'Ticket promedio']) {
        expect(tile(nombre)).toHaveTextContent('—');
        expect(tile(nombre)).toHaveTextContent('Llega con los pagos.');
      }
    });

    it('con una divisa muestra el dinero y su cambio; con varias, una línea por divisa y sin cambio', async () => {
      await negocioConLeads([]);
      const base = { visits: { value: 1, previous: 1 }, leads: { value: 1, previous: 1 }, conversion: { value: 1, previous: 1 } };
      vi.mocked(analytics.getSummary).mockResolvedValue({ ...base, revenue: [{ currency: 'MXN', value: 1500, previous: 1000 }], averageTicket: [{ currency: 'MXN', value: 500, previous: 500 }] });
      const { unmount } = await abrir();
      expect(tile('Ingresos')).toHaveTextContent(/1500,00/);
      expect(tile('Ingresos')).toHaveTextContent('+50 %');
      expect(tile('Ticket promedio')).toHaveTextContent('Sin cambios');
      unmount();

      vi.mocked(analytics.getSummary).mockResolvedValue({ ...base, revenue: [{ currency: 'MXN', value: 1500, previous: 1000 }, { currency: 'USD', value: 20, previous: 10 }], averageTicket: [] });
      await abrir();
      expect(within(tile('Ingresos')).getAllByText(/\d/)).toHaveLength(2);
      expect(tile('Ingresos')).toHaveTextContent(/US\$|USD/);
      expect(tile('Ingresos')).not.toHaveTextContent('vs. periodo anterior');
    });
  });

  describe('el embudo de conversión', () => {
    it('una fila por etapa con las personas, el porcentaje de las visitas y el de la etapa anterior', async () => {
      const { funnels } = await negocioConLeads([]);
      actividadBasica(funnels[0].id);
      await abrir();
      const embudo = tarjeta('Embudo de conversión');
      expect(filas(embudo).map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Visitas', 'Leads', 'Oportunidades', 'Clientes']);
      expect(celdas(fila(embudo, 'Visitas'))).toEqual(['', '10', '100 %', '—']);
      expect(celdas(fila(embudo, 'Leads'))).toEqual(['', '4', '40 %', '40 %']);
      expect(celdas(fila(embudo, 'Oportunidades'))).toEqual(['', '0', '0 %', '0 %']);
    });

    it('las barras son proporcionales a la etapa con más personas y cada etapa tiene su paso de la rampa', async () => {
      const { funnels } = await negocioConLeads([]);
      actividadBasica(funnels[0].id);
      await abrir();
      const embudo = tarjeta('Embudo de conversión');
      expect(anchoDeBarra(fila(embudo, 'Visitas'))).toBe('100%');
      expect(anchoDeBarra(fila(embudo, 'Leads'))).toBe('40%');
      expect(anchoDeBarra(fila(embudo, 'Oportunidades'))).toBe('0%');
      expect(filas(embudo).map(colorDeBarra)).toEqual(['var(--chart-ramp-1)', 'var(--chart-ramp-3)', 'var(--chart-ramp-4)', 'var(--chart-ramp-6)']);
    });

    it('una etapa con poca gente igual se ve (no se queda en cero píxeles)', async () => {
      const { funnels } = await negocioConLeads([]);
      sembrarEvento(funnels[0].id, 'page_view', 2, {}, 1000);
      sembrarLead(funnels[0].id, 2, {}, 1);
      await abrir();
      expect(parseFloat(anchoDeBarra(fila(tarjeta('Embudo de conversión'), 'Leads')))).toBeGreaterThanOrEqual(1.5);
    });

    it('sin nada en el periodo lo dice en vez de dibujar barras vacías', async () => {
      await negocioConLeads([]);
      await abrir();
      expect(within(tarjeta('Embudo de conversión')).getByText('Todavía no hay visitas ni leads en este periodo.')).toBeInTheDocument();
      expect(within(tarjeta('Embudo de conversión')).queryByRole('table')).not.toBeInTheDocument();
    });

    it('la tabla es el equivalente accesible: tiene título y encabezados', async () => {
      const { funnels } = await negocioConLeads([]);
      actividadBasica(funnels[0].id);
      await abrir();
      const tabla = within(tarjeta('Embudo de conversión')).getByRole('table');
      expect(tabla).toHaveAccessibleName(/Personas en cada etapa del embudo/);
      expect(within(tabla).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Etapa', 'Proporción', 'Personas', 'De las visitas', 'De la anterior']);
    });
  });

  describe('de dónde vienen las visitas', () => {
    it('una fila por origen, del que más trae al que menos, con sus visitas, su parte y su conversión', async () => {
      const { funnels } = await negocioConLeads([]);
      sembrarEvento(funnels[0].id, 'page_view', 1, { source: 'instagram' }, 6);
      sembrarEvento(funnels[0].id, 'page_view', 1, { source: 'facebook' }, 3);
      sembrarEvento(funnels[0].id, 'page_view', 1, {}, 1);
      sembrarLead(funnels[0].id, 1, { utm_source: 'instagram' }, 3);
      await abrir();
      const origenes = tarjeta('De dónde vienen tus visitas');
      expect(filas(origenes).map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['instagram', 'facebook', 'Directo']);
      expect(celdas(fila(origenes, 'instagram'))).toEqual(['', '6', '60 %', '50 %']);
      expect(celdas(fila(origenes, 'Directo'))).toEqual(['', '1', '10 %', '0 %']);
    });

    it('todas las barras llevan el mismo color y su longitud va con las visitas', async () => {
      const { funnels } = await negocioConLeads([]);
      sembrarEvento(funnels[0].id, 'page_view', 1, { source: 'instagram' }, 8);
      sembrarEvento(funnels[0].id, 'page_view', 1, { source: 'facebook' }, 2);
      await abrir();
      const origenes = tarjeta('De dónde vienen tus visitas');
      expect(filas(origenes).map(colorDeBarra)).toEqual(['var(--chart-1)', 'var(--chart-1)']);
      expect(filas(origenes).map(anchoDeBarra)).toEqual(['100%', '25%']);
    });

    it('un origen escrito por un visitante se muestra como texto, no como HTML', async () => {
      const { funnels } = await negocioConLeads([]);
      sembrarEvento(funnels[0].id, 'page_view', 1, { source: '<img src=x onerror=alert(1)>' }, 2);
      const { container } = await abrir();
      expect(container.querySelector('img[src="x"]')).toBeNull();
      expect(within(tarjeta('De dónde vienen tus visitas')).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    });

    it('sin visitas lo dice', async () => {
      await negocioConLeads([]);
      await abrir();
      expect(within(tarjeta('De dónde vienen tus visitas')).getByText('Todavía no hay visitas en este periodo.')).toBeInTheDocument();
    });
  });

  describe('dónde abandonan', () => {
    async function conPagina() {
      const base = await negocioConLeads([]);
      const funnel = base.funnels[0];
      await saveContent(base.token, funnel.id, [bloque('encabezado', 'encabezado'), bloque('beneficios', 'beneficios', undefined, 2), bloque('testimonios', 'testimonios', undefined, 3), { ...FORMULARIO, order: 4 }]);
      sembrarEvento(funnel.id, 'page_view', 1, {}, 10);
      sembrarEvento(funnel.id, 'section_view', 1, { section: 'encabezado' }, 10);
      sembrarEvento(funnel.id, 'section_view', 1, { section: 'beneficios' }, 8);
      sembrarEvento(funnel.id, 'section_view', 1, { section: 'testimonios' }, 4);
      sembrarEvento(funnel.id, 'section_view', 1, { section: 'formulario' }, 3);
      return { ...base, funnel };
    }

    it('sin elegir un funnel pide elegir uno y no pide nada al servidor', async () => {
      await conPagina();
      await abrir();
      expect(within(tarjeta('Dónde abandonan')).getByText('Elige un funnel arriba para ver en qué sección de su página abandonan.')).toBeInTheDocument();
      expect(analytics.getDropOff).not.toHaveBeenCalled();
    });

    it('con un funnel, las secciones en el orden de la página con lo que llega y lo que se pierde', async () => {
      const { funnel } = await conPagina();
      await abrir();
      await userEvent.selectOptions(screen.getByLabelText('Funnel'), funnel.name);
      await waitFor(() => expect(within(tarjeta('Dónde abandonan')).getAllByRole('row')).toHaveLength(5));
      const abandono = tarjeta('Dónde abandonan');
      expect(filas(abandono).map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Encabezado', 'Beneficios', 'TestimoniosMayor abandono', 'Formulario']);
      expect(celdas(fila(abandono, /^Encabezado/))).toEqual(['', '100 %', '—']);
      expect(celdas(fila(abandono, /^Beneficios/))).toEqual(['', '80 %', '−20 pts']);
      expect(celdas(fila(abandono, /^Formulario/))).toEqual(['', '30 %', '−10 pts']);
    });

    it('destaca solo la sección donde más gente se va: las demás barras van en gris', async () => {
      const { funnel } = await conPagina();
      await abrir();
      await userEvent.selectOptions(screen.getByLabelText('Funnel'), funnel.name);
      await waitFor(() => expect(within(tarjeta('Dónde abandonan')).getAllByRole('row')).toHaveLength(5));
      const abandono = tarjeta('Dónde abandonan');
      expect(within(abandono).getAllByText('Mayor abandono')).toHaveLength(1);
      expect(within(fila(abandono, /^Testimonios/)).getByText('Mayor abandono')).toBeInTheDocument();
      expect(filas(abandono).map(colorDeBarra)).toEqual(['var(--muted)', 'var(--muted)', 'var(--chart-1)', 'var(--muted)']);
    });

    it('si nadie se va no destaca ninguna', async () => {
      const { funnel, funnels } = await conPagina();
      editarBaseDeDemostracion((db) => {
        db.events = db.events.filter((e: Record<string, any>) => e.funnelId !== funnels[0].id);
      });
      sembrarEvento(funnel.id, 'page_view', 1, {}, 4);
      for (const seccion of ['encabezado', 'beneficios', 'testimonios', 'formulario']) sembrarEvento(funnel.id, 'section_view', 1, { section: seccion }, 4);
      await abrir();
      await userEvent.selectOptions(screen.getByLabelText('Funnel'), funnel.name);
      await waitFor(() => expect(within(tarjeta('Dónde abandonan')).getAllByRole('row')).toHaveLength(5));
      expect(within(tarjeta('Dónde abandonan')).queryByText('Mayor abandono')).not.toBeInTheDocument();
    });

    it('un funnel sin visitas dice que todavía no hay visitas, y uno sin secciones, que no tiene secciones', async () => {
      const { funnels, token } = await negocioConLeads([]);
      await abrir();
      await userEvent.selectOptions(screen.getByLabelText('Funnel'), funnels[0].name);
      expect(await within(tarjeta('Dónde abandonan')).findByText('Todavía no hay visitas en este periodo.')).toBeInTheDocument();
      await saveContent(token, funnels[1].id, []);
      await userEvent.selectOptions(screen.getByLabelText('Funnel'), funnels[1].name);
      expect(await within(tarjeta('Dónde abandonan')).findByText('Esta página todavía no tiene secciones.')).toBeInTheDocument();
    });
  });

  describe('rendimiento por funnel', () => {
    it('una fila por funnel con su estado, sus cifras y un enlace a su editor', async () => {
      const { funnels } = await negocioConLeads([]);
      sembrarEvento(funnels[0].id, 'page_view', 1, {}, 10);
      sembrarLead(funnels[0].id, 1, {}, 1);
      sembrarEvento(funnels[1].id, 'page_view', 1, {}, 8);
      sembrarLead(funnels[1].id, 1, {}, 4);
      const { router } = await abrir();
      const rendimiento = tarjeta('Rendimiento por funnel');
      expect(filas(rendimiento).map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Taller de ventasCaptar leads', 'Curso de datosCaptar leads']);
      expect(celdas(fila(rendimiento, /Taller de ventas/))).toEqual(['Publicado', '8', '4', '50 %', '—']);
      await userEvent.click(within(rendimiento).getByRole('link', { name: 'Curso de datos' }));
      expect(router.state.location.pathname).toBe(`/funnels/${funnels[0].id}/editor`);
    });
  });

  describe('rendimiento por funnel: borradores', () => {
    it('un funnel sin publicar se marca como borrador y sigue contando', async () => {
      const { token, workspace } = await negocioConLeads([]);
      await createFunnel(token, { workspaceId: workspace.id, name: 'Idea sin publicar', objective: 'magnet' });
      await abrir();
      const rendimiento = tarjeta('Rendimiento por funnel');
      expect(celdas(fila(rendimiento, /Idea sin publicar/))).toEqual(['Borrador', '0', '0', '0 %', '—']);
      expect(celdas(fila(rendimiento, /Curso de datos/))[0]).toBe('Publicado');
    });
  });

  describe('los filtros', () => {
    it('el periodo cambia todas las cifras y se queda marcado', async () => {
      const { funnels } = await negocioConLeads([]);
      sembrarEvento(funnels[0].id, 'page_view', 2, {}, 3);
      sembrarEvento(funnels[0].id, 'page_view', 20, {}, 7);
      await abrir();
      expect(screen.getByRole('radio', { name: '30 días' })).toBeChecked();
      expect(tile('Visitas')).toHaveTextContent('10');
      await userEvent.click(screen.getByRole('radio', { name: '7 días' }));
      await waitFor(() => expect(tile('Visitas')).toHaveTextContent('3'));
      expect(screen.getByRole('radio', { name: '7 días' })).toBeChecked();
      expect(vi.mocked(analytics.getSummary).mock.calls.at(-1)![1]).toMatchObject({ range: '7d' });
      expect(vi.mocked(analytics.getSources).mock.calls.at(-1)![1]).toMatchObject({ range: '7d' });
      expect(vi.mocked(analytics.getFunnelsPerformance).mock.calls.at(-1)![1]).toMatchObject({ range: '7d' });
      await userEvent.click(screen.getByRole('radio', { name: '90 días' }));
      await waitFor(() => expect(vi.mocked(analytics.getSummary).mock.calls.at(-1)![1]).toMatchObject({ range: '90d' }));
    });

    it('empieza con 30 días y «Todos los funnels»', async () => {
      await negocioConLeads([]);
      await abrir();
      expect(vi.mocked(analytics.getSummary).mock.calls[0]![1]).toMatchObject({ range: '30d' });
      expect(vi.mocked(analytics.getSummary).mock.calls[0]![1]).not.toHaveProperty('funnelId');
      expect(screen.getByLabelText('Funnel')).toHaveDisplayValue('Todos los funnels');
    });

    it('el funnel deja todo con lo suyo, y «Todos los funnels» lo devuelve', async () => {
      const { funnels } = await negocioConLeads([]);
      sembrarEvento(funnels[0].id, 'page_view', 1, {}, 6);
      sembrarEvento(funnels[1].id, 'page_view', 1, {}, 4);
      await abrir();
      expect(tile('Visitas')).toHaveTextContent('10');
      await userEvent.selectOptions(screen.getByLabelText('Funnel'), funnels[1].name);
      await waitFor(() => expect(tile('Visitas')).toHaveTextContent('4'));
      expect(vi.mocked(analytics.getSummary).mock.calls.at(-1)![1]).toMatchObject({ funnelId: funnels[1].id });
      expect(filas(tarjeta('Rendimiento por funnel'))).toHaveLength(1);
      await userEvent.selectOptions(screen.getByLabelText('Funnel'), 'Todos los funnels');
      await waitFor(() => expect(tile('Visitas')).toHaveTextContent('10'));
      expect(vi.mocked(analytics.getSummary).mock.calls.at(-1)![1]).not.toHaveProperty('funnelId');
    });

    it('los filtros están arriba y en una sola fila, antes de todo lo que filtran', async () => {
      await negocioConLeads([]);
      await abrir();
      const periodo = screen.getByRole('group', { name: 'Periodo' });
      const embudo = tarjeta('Embudo de conversión');
      expect(periodo.compareDocumentPosition(resumen()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(periodo.compareDocumentPosition(embudo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(embudo.contains(screen.getByLabelText('Funnel'))).toBe(false);
    });

    it('al cambiar un filtro se sigue viendo lo anterior, atenuado, sin volver a «Cargando…»', async () => {
      const { funnels } = await negocioConLeads([]);
      sembrarEvento(funnels[0].id, 'page_view', 2, {}, 3);
      await abrir();
      const real = (await vi.importActual<typeof import('@/services/analytics')>('@/services/analytics')).getSummary;
      let soltar: () => void = () => undefined;
      vi.mocked(analytics.getSummary).mockImplementationOnce((token, query, signal) => new Promise((resolver) => (soltar = () => resolver(real(token, query, signal)))));
      await userEvent.click(screen.getByRole('radio', { name: '7 días' }));
      const marco = resumen().parentElement!;
      await waitFor(() => expect(marco).toHaveAttribute('aria-busy', 'true'));
      expect(marco.className).toContain('opacity-60');
      expect(tile('Visitas')).toHaveTextContent('3'); // lo anterior sigue ahí
      expect(screen.queryByText('Cargando tu dashboard…')).not.toBeInTheDocument();
      soltar();
      await waitFor(() => expect(marco).toHaveAttribute('aria-busy', 'false'));
      expect(marco.className).not.toContain('opacity-60');
    });

    it('si dos cambios se cruzan, gana el último', async () => {
      const { funnels } = await negocioConLeads([]);
      sembrarEvento(funnels[0].id, 'page_view', 2, {}, 3);
      sembrarEvento(funnels[0].id, 'page_view', 20, {}, 7);
      await abrir();
      const real = (await vi.importActual<typeof import('@/services/analytics')>('@/services/analytics')).getSummary;
      let soltarLaVieja: () => void = () => undefined;
      vi.mocked(analytics.getSummary).mockImplementationOnce((token, query) => new Promise((resolver) => (soltarLaVieja = () => resolver(real(token, query)))));
      await userEvent.click(screen.getByRole('radio', { name: '7 días' })); // esta tarda
      await userEvent.click(screen.getByRole('radio', { name: '90 días' })); // esta responde enseguida
      await waitFor(() => expect(tile('Visitas')).toHaveTextContent('10'));
      soltarLaVieja();
      await new Promise((r) => setTimeout(r, 60));
      expect(tile('Visitas')).toHaveTextContent('10');
      expect(screen.getByRole('radio', { name: '90 días' })).toBeChecked();
    });
  });

  describe('cuando algo falla o falta', () => {
    it('si no se puede cargar avisa y deja reintentar', async () => {
      await negocioConLeads([]);
      vi.mocked(analytics.getSources).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
      montar('/');
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar tu dashboard.');
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      await screen.findByRole('list', { name: 'Resumen del periodo' });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('sin funnels explica qué hacer en vez de mostrar ceros', async () => {
      await negocioConLeads([]);
      editarBaseDeDemostracion((db) => {
        db.funnels = [];
      });
      const { router } = montar('/');
      expect(await screen.findByRole('heading', { name: 'Todavía no tienes funnels' })).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Resumen del periodo' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('link', { name: /crear mi primer funnel/i }));
      expect(router.state.location.pathname).toBe('/funnels/nuevo');
    });
  });

  describe('quién lo ve', () => {
    it.each(['super_admin', 'client_admin', 'marketing_manager', 'vendedor', 'analista'])('el rol %s ve el dashboard', async (rol) => {
      await negocioConLeads([], { role: rol });
      await abrir();
      expect(analytics.getSummary).toHaveBeenCalled();
    });

    it('el diseñador solo ve un saludo, sin pedir nada de analítica', async () => {
      await negocioConLeads([], { role: 'disenador' });
      montar('/');
      expect(await screen.findByText(/tu rol no incluye el dashboard/i)).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Resumen del periodo' })).not.toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 50));
      for (const fn of llamadas) expect(fn).not.toHaveBeenCalled();
    });

    it('al cambiar de negocio empieza de cero (sin los filtros del anterior)', async () => {
      const { funnels } = await negocioConLeads([]);
      editarBaseDeDemostracion((db) => {
        db.workspaces.push({ ...db.workspaces[0], id: 'otro-negocio', name: 'Otro negocio' });
      });
      await abrir();
      await userEvent.selectOptions(screen.getByLabelText('Funnel'), funnels[0].name);
      await userEvent.click(screen.getByRole('radio', { name: '7 días' }));
      await waitFor(() => expect(vi.mocked(analytics.getSummary).mock.calls.at(-1)![1]).toMatchObject({ range: '7d', funnelId: funnels[0].id }));
      await userEvent.selectOptions(screen.getByLabelText('Negocio activo'), 'Otro negocio');
      await waitFor(() => expect(vi.mocked(analytics.getSummary).mock.calls.at(-1)![1]).toMatchObject({ workspaceId: 'otro-negocio', range: '30d' }));
      expect(vi.mocked(analytics.getSummary).mock.calls.at(-1)![1]).not.toHaveProperty('funnelId');
    });
  });
});

