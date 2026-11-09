import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDropOff, getFunnelConversion, getFunnelsPerformance, getSources, getSummary, type AnalyticsQuery } from '@/services/analytics';
import type { ApiError } from '@/services/api';
import { apiFetch } from '@/services/api';
import { createFunnel, saveContent } from '@/services/funnels';
import { listLeadStages, updateLead, listLeads } from '@/services/leads';
import { negocioConLeads, sembrarEvento, sembrarLead } from './helpers/leadsApp';
import { bloque, FORMULARIO } from './helpers/publicApp';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const falla = async (promesa: Promise<unknown>) => (await promesa.catch((e: unknown) => e)) as ApiError;
const evento = sembrarEvento;
const lead = sembrarLead;

async function entorno() {
  const base = await negocioConLeads([]);
  const consulta = (extra: Partial<AnalyticsQuery> = {}): AnalyticsQuery => ({ workspaceId: base.workspace.id, range: '30d', ...extra });
  return { ...base, consulta };
}

describe('modo demostración: GET /analytics/summary', () => {
  it('cuenta visitas y leads del periodo y del anterior, y calcula la conversión de cada uno', async () => {
    const { token, funnels, consulta } = await entorno();
    const [a] = funnels;
    evento(a.id, 'page_view', 2, {}, 10);
    lead(a.id, 3, {}, 4);
    evento(a.id, 'page_view', 40, {}, 5); // periodo anterior (de 30 a 60 días)
    lead(a.id, 45, {}, 1);
    evento(a.id, 'page_view', 100, {}, 50); // fuera de los dos
    lead(a.id, 100, {}, 9);
    expect(await getSummary(token, consulta())).toEqual({
      visits: { value: 10, previous: 5 },
      leads: { value: 4, previous: 1 },
      conversion: { value: 40, previous: 20 },
      revenue: [],
      averageTicket: [],
    });
  });

  it('los porcentajes llevan un decimal (1 de 3 es 33,3 %)', async () => {
    const { token, funnels, consulta } = await entorno();
    evento(funnels[0].id, 'page_view', 2, {}, 3);
    lead(funnels[0].id, 2, {}, 1);
    expect((await getSummary(token, consulta())).conversion.value).toBe(33.3);
    expect((await getFunnelConversion(token, consulta()))[1]).toMatchObject({ percentOfVisits: 33.3, percentOfPrevious: 33.3 });
    expect((await getFunnelsPerformance(token, consulta())).find((f) => f.visits === 3)?.conversion).toBe(33.3);
  });

  it('sin visitas la conversión es 0, no un error', async () => {
    const { token, funnels, consulta } = await entorno();
    lead(funnels[0].id, 1, {}, 3);
    expect((await getSummary(token, consulta())).conversion).toEqual({ value: 0, previous: 0 });
  });

  it('el periodo de 7 días deja fuera lo de hace 10 días, y 90 días lo incluye', async () => {
    const { token, funnels, consulta } = await entorno();
    evento(funnels[0].id, 'page_view', 1, {}, 2);
    evento(funnels[0].id, 'page_view', 10, {}, 3);
    evento(funnels[0].id, 'page_view', 80, {}, 4);
    expect((await getSummary(token, consulta({ range: '7d' }))).visits).toEqual({ value: 2, previous: 3 });
    expect((await getSummary(token, consulta({ range: '30d' }))).visits).toEqual({ value: 5, previous: 0 });
    expect((await getSummary(token, consulta({ range: '90d' }))).visits.value).toBe(9);
  });

  it('sin indicar el periodo usa 30 días', async () => {
    const { token, funnels, workspace } = await entorno();
    evento(funnels[0].id, 'page_view', 20, {}, 2);
    evento(funnels[0].id, 'page_view', 40, {}, 5);
    const resumen = await apiFetch<{ visits: { value: number } }>(`/analytics/summary?workspaceId=${workspace.id}`, { token });
    expect(resumen.visits.value).toBe(2);
  });

  it('con un funnel solo cuenta lo de ese funnel', async () => {
    const { token, funnels, consulta } = await entorno();
    evento(funnels[0].id, 'page_view', 1, {}, 6);
    evento(funnels[1].id, 'page_view', 1, {}, 4);
    lead(funnels[1].id, 1, {}, 2);
    expect((await getSummary(token, consulta())).visits.value).toBe(10);
    expect(await getSummary(token, consulta({ funnelId: funnels[1].id }))).toMatchObject({ visits: { value: 4 }, leads: { value: 2 } });
  });

  it('un periodo que no existe es un error de validación y falta el negocio también', async () => {
    const { token, workspace } = await entorno();
    const rango = await falla(apiFetch(`/analytics/summary?workspaceId=${workspace.id}&range=1y`, { token }));
    expect(rango.status).toBe(422);
    expect(rango.fieldErrors()).toHaveProperty('range');
    const sinNegocio = await falla(apiFetch('/analytics/summary', { token }));
    expect(sinNegocio.status).toBe(422);
    expect(sinNegocio.fieldErrors()).toHaveProperty('workspaceId');
  });

  it('un negocio o un funnel ajeno responden 404 y sin sesión 401', async () => {
    const { token, funnels, workspace } = await entorno();
    const otro = await negocioConLeads([], { email: 'beto@correo.com' });
    expect((await falla(getSummary(token, { workspaceId: otro.workspace.id, range: '30d' }))).status).toBe(404);
    expect((await falla(getSummary(token, { workspaceId: 'no-existe', range: '30d' }))).status).toBe(404);
    expect((await falla(getSummary(otro.token, { workspaceId: workspace.id, range: '30d' }))).status).toBe(404);
    expect((await falla(getSummary(token, { workspaceId: workspace.id, funnelId: otro.funnels[0].id, range: '30d' }))).status).toBe(404);
    expect((await falla(getSummary('token-falso', { workspaceId: workspace.id, range: '30d' }))).status).toBe(401);
    expect(funnels).toHaveLength(2);
  });
});

describe('modo demostración: GET /analytics/funnel-conversion', () => {
  it('visitas → leads → oportunidades → clientes, con el porcentaje de las visitas y de la etapa anterior', async () => {
    const { token, funnels, workspace, consulta } = await entorno();
    evento(funnels[0].id, 'page_view', 2, {}, 20);
    lead(funnels[0].id, 2, {}, 8);
    const etapas = await listLeadStages(token, workspace.id);
    const { items } = await listLeads(token, workspace.id);
    expect(items).toHaveLength(8);
    // 3 en «Oportunidad», 1 en «Cliente»: las oportunidades son esas etapas y las que siguen.
    for (const [i, nombre] of ['Oportunidad', 'Oportunidad', 'Oportunidad', 'Cliente'].entries()) await updateLead(token, items[i]!.id, { leadStageId: etapas.find((e) => e.name === nombre)!.id });
    const resultado = await getFunnelConversion(token, consulta());
    expect(resultado.map((e) => [e.key, e.label, e.count, e.percentOfVisits, e.percentOfPrevious])).toEqual([
      ['visits', 'Visitas', 20, 100, null],
      ['leads', 'Leads', 8, 40, 40],
      ['opportunities', 'Oportunidades', 4, 20, 50],
      ['customers', 'Clientes', 1, 5, 25],
    ]);
  });

  it('sin visitas los porcentajes no se inventan', async () => {
    const { token, funnels, consulta } = await entorno();
    lead(funnels[0].id, 1, {}, 2);
    const resultado = await getFunnelConversion(token, consulta());
    expect(resultado[0]).toMatchObject({ key: 'visits', count: 0, percentOfVisits: null, percentOfPrevious: null });
    expect(resultado[1]).toMatchObject({ key: 'leads', count: 2, percentOfVisits: null, percentOfPrevious: null });
  });

  it('solo cuenta lo del periodo', async () => {
    const { token, funnels, consulta } = await entorno();
    evento(funnels[0].id, 'page_view', 2, {}, 5);
    evento(funnels[0].id, 'page_view', 50, {}, 50);
    lead(funnels[0].id, 50, {}, 9);
    const resultado = await getFunnelConversion(token, consulta());
    expect(resultado.map((e) => e.count)).toEqual([5, 0, 0, 0]);
  });

  it('el checkout y los pagos solo aparecen si algún funnel cobra', async () => {
    const { token, workspace, funnels, consulta } = await entorno();
    expect((await getFunnelConversion(token, consulta())).map((e) => e.key)).toEqual(['visits', 'leads', 'opportunities', 'customers']);
    const venta = await createFunnel(token, { workspaceId: workspace.id, name: 'Curso en línea', objective: 'venta' });
    evento(venta.id, 'checkout_started', 1, {}, 3);
    evento(venta.id, 'payment_completed', 1, {}, 2);
    expect((await getFunnelConversion(token, consulta())).map((e) => [e.key, e.count])).toEqual([['visits', 0], ['leads', 0], ['opportunities', 0], ['checkout', 3], ['payments', 2], ['customers', 0]]);
    // Con un funnel que no cobra, el embudo vuelve a ser el corto.
    expect((await getFunnelConversion(token, consulta({ funnelId: funnels[0].id }))).map((e) => e.key)).toEqual(['visits', 'leads', 'opportunities', 'customers']);
  });
});

describe('modo demostración: GET /analytics/sources', () => {
  it('agrupa las visitas por origen, del que más trae al que menos, con su porcentaje y su conversión', async () => {
    const { token, funnels, consulta } = await entorno();
    const [a] = funnels;
    evento(a.id, 'page_view', 1, { source: 'instagram' }, 6);
    evento(a.id, 'page_view', 1, { source: 'facebook' }, 3);
    evento(a.id, 'page_view', 1, {}, 1);
    lead(a.id, 1, { utm_source: 'instagram' }, 3);
    lead(a.id, 1, {}, 1);
    const { total, items } = await getSources(token, consulta());
    expect(total).toBe(10);
    expect(items).toEqual([
      { source: 'instagram', clicks: 6, percent: 60, conversion: 50 },
      { source: 'facebook', clicks: 3, percent: 30, conversion: 0 },
      { source: 'Directo', clicks: 1, percent: 10, conversion: 100 },
    ]);
  });

  it('un lead que llegó de otro sitio cuenta para ese sitio', async () => {
    const { token, funnels, consulta } = await entorno();
    evento(funnels[0].id, 'page_view', 1, { source: 'www.google.com' }, 4);
    lead(funnels[0].id, 1, { referrer: 'https://www.google.com/search?q=datos' }, 1);
    expect((await getSources(token, consulta())).items).toEqual([{ source: 'www.google.com', clicks: 4, percent: 100, conversion: 25 }]);
  });

  it('con empate ordena por nombre y no devuelve más de 10', async () => {
    const { token, funnels, consulta } = await entorno();
    for (let i = 0; i < 12; i++) evento(funnels[0].id, 'page_view', 1, { source: `canal-${String(i).padStart(2, '0')}` }, 1);
    const { total, items } = await getSources(token, consulta());
    expect(total).toBe(12);
    expect(items).toHaveLength(10);
    expect(items.map((i) => i.source)).toEqual([...items.map((i) => i.source)].sort());
  });

  it('solo cuenta el periodo y el funnel pedidos, y sin visitas devuelve una lista vacía', async () => {
    const { token, funnels, consulta } = await entorno();
    expect(await getSources(token, consulta())).toEqual({ total: 0, items: [] });
    evento(funnels[0].id, 'page_view', 1, { source: 'a' }, 2);
    evento(funnels[1].id, 'page_view', 1, { source: 'b' }, 3);
    evento(funnels[1].id, 'page_view', 60, { source: 'c' }, 3);
    expect((await getSources(token, consulta({ funnelId: funnels[1].id }))).items.map((i) => i.source)).toEqual(['b']);
  });
});

describe('modo demostración: GET /analytics/drop-off', () => {
  async function conPagina() {
    const base = await entorno();
    const funnel = base.funnels[0];
    await saveContent(base.token, funnel.id, [bloque('encabezado', 'encabezado'), bloque('beneficios', 'beneficios', undefined, 2), bloque('testimonios', 'testimonios', undefined, 3), { ...FORMULARIO, order: 4 }]);
    return { ...base, funnel };
  }

  it('dice cuántas visitas llegan a cada sección, en el orden de la página, y cuántos puntos se pierden', async () => {
    const { token, funnel, consulta } = await conPagina();
    evento(funnel.id, 'page_view', 1, {}, 10);
    evento(funnel.id, 'section_view', 1, { section: 'encabezado' }, 10);
    evento(funnel.id, 'section_view', 1, { section: 'beneficios' }, 8);
    evento(funnel.id, 'section_view', 1, { section: 'testimonios' }, 4);
    evento(funnel.id, 'section_view', 1, { section: 'formulario' }, 3);
    expect(await getDropOff(token, { ...consulta(), funnelId: funnel.id })).toEqual([
      { section: 'encabezado', reachedPercent: 100, dropPoints: 0 },
      { section: 'beneficios', reachedPercent: 80, dropPoints: 20 },
      { section: 'testimonios', reachedPercent: 40, dropPoints: 40 },
      { section: 'formulario', reachedPercent: 30, dropPoints: 10 },
    ]);
  });

  it('sin visitas nadie llegó a ninguna sección; llegar a más que la anterior no da puntos negativos', async () => {
    const { token, funnel, consulta } = await conPagina();
    expect((await getDropOff(token, { ...consulta(), funnelId: funnel.id })).map((r) => [r.reachedPercent, r.dropPoints])).toEqual([[0, 100], [0, 0], [0, 0], [0, 0]]);
    evento(funnel.id, 'page_view', 1, {}, 4);
    evento(funnel.id, 'section_view', 1, { section: 'encabezado' }, 2);
    evento(funnel.id, 'section_view', 1, { section: 'beneficios' }, 4);
    evento(funnel.id, 'section_view', 1, { section: 'testimonios' }, 9); // más que las visitas: se topa en 100
    const filas = await getDropOff(token, { ...consulta(), funnelId: funnel.id });
    expect(filas.map((r) => r.reachedPercent)).toEqual([50, 100, 100, 0]);
    expect(filas.map((r) => r.dropPoints)).toEqual([50, 0, 0, 100]);
  });

  it('exige un funnel y solo acepta los del negocio', async () => {
    const { token, workspace, consulta } = await conPagina();
    const sinFunnel = await falla(apiFetch(`/analytics/drop-off?workspaceId=${workspace.id}&range=30d`, { token }));
    expect(sinFunnel.status).toBe(422);
    expect(sinFunnel.fieldErrors()).toHaveProperty('funnelId');
    const otro = await negocioConLeads([], { email: 'beto@correo.com' });
    expect((await falla(getDropOff(token, { ...consulta(), funnelId: otro.funnels[0].id }))).status).toBe(404);
  });
});

describe('modo demostración: GET /analytics/funnels', () => {
  it('el rendimiento de cada funnel, del que más leads trae al que menos', async () => {
    const { token, funnels, consulta } = await entorno();
    evento(funnels[0].id, 'page_view', 1, {}, 10);
    lead(funnels[0].id, 1, {}, 1);
    evento(funnels[1].id, 'page_view', 1, {}, 8);
    lead(funnels[1].id, 1, {}, 4);
    const filas = await getFunnelsPerformance(token, consulta());
    expect(filas.map((f) => [f.name, f.visits, f.leads, f.conversion])).toEqual([
      ['Taller de ventas', 8, 4, 50],
      ['Curso de datos', 10, 1, 10],
    ]);
    expect(filas[0]).toMatchObject({ funnelId: funnels[1].id, objective: 'leads', status: 'published', revenue: [] });
  });

  it('con empate ordena por nombre, cuenta los borradores y respeta el funnel pedido', async () => {
    const { token, workspace, funnels, consulta } = await entorno();
    const borrador = await createFunnel(token, { workspaceId: workspace.id, name: 'Borrador nuevo', objective: 'magnet' });
    expect((await getFunnelsPerformance(token, consulta())).map((f) => f.name)).toEqual(['Borrador nuevo', 'Curso de datos', 'Taller de ventas']);
    expect((await getFunnelsPerformance(token, consulta())).find((f) => f.funnelId === borrador.id)).toMatchObject({ status: 'draft', objective: 'magnet', visits: 0, leads: 0, conversion: 0 });
    expect((await getFunnelsPerformance(token, consulta({ funnelId: funnels[0].id }))).map((f) => f.name)).toEqual(['Curso de datos']);
  });
});
