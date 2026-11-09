import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { DIRECT, leadSource, moneyRows, percent, round, windowsFor } from '../src/lib/analytics.js';
import { testDatabaseUrl } from './helpers/db.js';
import { agregarMiembro, crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

const DIA = 86_400_000;
/** Una fecha `dias` días antes de ahora (a media jornada, lejos de los bordes de cada periodo). */
const hace = (dias: number) => new Date(Date.now() - dias * DIA);

describe('cálculos de la analítica (sin base de datos)', () => {
  it('el periodo anterior es del mismo tamaño y queda pegado al actual', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const { current, previous } = windowsFor({ range: '7d' }, now);
    expect(current).toEqual({ from: new Date('2026-10-13T12:00:00Z'), to: now });
    expect(previous).toEqual({ from: new Date('2026-10-06T12:00:00Z'), to: new Date('2026-10-13T12:00:00Z') });

    const exact = windowsFor({ from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-04T00:00:00Z') }, now);
    expect(exact.current).toEqual({ from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-04T00:00:00Z') });
    expect(exact.previous).toEqual({ from: new Date('2026-09-28T00:00:00Z'), to: new Date('2026-10-01T00:00:00Z') });
  });

  it('el porcentaje lleva un decimal y es 0 sin con qué comparar; el redondeo respeta los decimales pedidos', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(2, 3)).toBe(66.7);
    expect(percent(5, 0)).toBe(0);
    expect(round(1.236, 2)).toBe(1.24);
    expect(round(2.345)).toBe(2.3);
  });

  it('el dinero se separa por divisa, con el periodo anterior y el ticket promedio; sin ventas, vacío', () => {
    expect(moneyRows([], [])).toEqual({ revenue: [], averageTicket: [] });
    // Una divisa sin pagos en uno de los periodos no divide entre cero.
    expect(moneyRows([{ currency: 'MXN', sum: 0, count: 0 }], []).averageTicket).toEqual([{ currency: 'MXN', value: 0, previous: 0 }]);
    const { revenue, averageTicket } = moneyRows(
      [{ currency: 'USD', sum: 30, count: 3 }, { currency: 'MXN', sum: 1000, count: 4 }],
      [{ currency: 'MXN', sum: 500, count: 2 }, { currency: 'CLP', sum: 9000, count: 1 }],
    );
    expect(revenue).toEqual([
      { currency: 'CLP', value: 0, previous: 9000 },
      { currency: 'MXN', value: 1000, previous: 500 },
      { currency: 'USD', value: 30, previous: 0 },
    ]);
    expect(averageTicket).toEqual([
      { currency: 'CLP', value: 0, previous: 9000 },
      { currency: 'MXN', value: 250, previous: 250 },
      { currency: 'USD', value: 10, previous: 0 },
    ]);
  });

  it('el origen de un lead sale de utm_source, del sitio de donde vino o es «Directo»; lo dañado no falla', () => {
    expect(leadSource({ utm_source: ' instagram ', referrer: 'https://google.com/x' })).toBe('instagram');
    expect(leadSource({ referrer: 'https://www.google.com/buscar?q=a' })).toBe('www.google.com');
    expect(leadSource({ utm_source: '   ', referrer: 'no es una dirección' })).toBe(DIRECT);
    for (const raro of [null, undefined, [], 'texto', 7, {}, { utm_source: 5, referrer: 7 }]) expect(leadSource(raro)).toBe(DIRECT);
  });
});

describe.skipIf(!testDatabaseUrl)('analítica del dashboard', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const get = (token: string, ruta: string) => request(app).get(`/api/v1${ruta}`).set(encabezados(token));
  const post = (token: string, ruta: string, body: object = {}) => request(app).post(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const put = (token: string, ruta: string, body: object) => request(app).put(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const miembro = (workspaceId: string, role: Parameters<typeof agregarMiembro>[4]) => agregarMiembro(app, prisma, config, workspaceId, role);
  const bloque = (key: string, type: string, content: object, order: number) => ({ key, type, order, content, style: {} });

  async function crearFunnel(token: string, workspaceId: string, objective: 'leads' | 'venta', name: string) {
    return (await post(token, '/funnels', { workspaceId, name, objective })).body as { id: string; slug: string };
  }

  /** Un negocio con un funnel de captación («Leads») y uno de venta («Venta»). */
  async function negocio() {
    const n = await crearNegocio(app, config);
    const leads = await crearFunnel(n.token, n.workspace.id, 'leads', 'Leads');
    const venta = await crearFunnel(n.token, n.workspace.id, 'venta', 'Venta');
    const etapas = await prisma.leadStage.findMany({ where: { workspaceId: n.workspace.id }, orderBy: { order: 'asc' } });
    return { ...n, leads, venta, etapas };
  }
  type Negocio = Awaited<ReturnType<typeof negocio>>;

  const ruta = (endpoint: string, n: { workspace: { id: string } }, extra = '') => `/analytics/${endpoint}?workspaceId=${n.workspace.id}${extra}`;

  async function evento(funnelId: string, type: string, dias: number, properties: object = {}, veces = 1) {
    await prisma.event.createMany({ data: Array.from({ length: veces }, () => ({ funnelId, type, properties, occurredAt: hace(dias) })) });
  }
  async function lead(funnelId: string, leadStageId: string, dias: number, utm: object | null = {}, veces = 1) {
    await prisma.lead.createMany({ data: Array.from({ length: veces }, () => ({ funnelId, leadStageId, utm: utm ?? undefined, createdAt: hace(dias) })) });
  }
  async function orden(funnelId: string, amount: number, currency: string, status: 'paid' | 'pending' | 'failed' | 'cancelled', pagadaHace: number | null, creadaHace = pagadaHace ?? 1) {
    await prisma.order.create({
      data: { funnelId, orderNumber: `ON-${randomUUID()}`, amount, currency, status, customerEmail: 'c@correo.com', paidAt: pagadaHace === null ? null : hace(pagadaHace), createdAt: hace(creadaHace) },
    });
  }

  describe('GET /analytics/summary', () => {
    it('cuenta visitas, leads y conversión del periodo y los compara con el anterior, sin contar lo de fuera ni lo de otros negocios', async () => {
      const n = await negocio();
      const otro = await negocio();
      await evento(n.leads.id, 'page_view', 2, {}, 8);
      await evento(n.venta.id, 'page_view', 3, {}, 2);
      await evento(n.leads.id, 'page_view', 10, {}, 5); // periodo anterior (7 a 14 días)
      await evento(n.leads.id, 'page_view', 40, {}, 9); // fuera de los dos
      await evento(n.leads.id, 'section_view', 1, { section: 'a' }, 4); // no es una visita
      await lead(n.leads.id, n.etapas[0]!.id, 1, {}, 2);
      await lead(n.leads.id, n.etapas[0]!.id, 9, {}, 1);
      await lead(n.leads.id, n.etapas[0]!.id, 50, {}, 4);
      await evento(otro.leads.id, 'page_view', 1, {}, 100);
      await lead(otro.leads.id, otro.etapas[0]!.id, 1, {}, 100);

      const res = await get(n.token, ruta('summary', n, '&range=7d'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        visits: { value: 10, previous: 5 },
        leads: { value: 2, previous: 1 },
        conversion: { value: 20, previous: 20 },
        revenue: [],
        averageTicket: [],
      });
    });

    it('el rango cambia el periodo (7d, 30d, 90d) y sin rango son 30 días', async () => {
      const n = await negocio();
      await evento(n.leads.id, 'page_view', 5, {}, 1);
      await evento(n.leads.id, 'page_view', 20, {}, 2);
      await evento(n.leads.id, 'page_view', 50, {}, 4);
      await evento(n.leads.id, 'page_view', 75, {}, 8);
      const visitas = async (extra: string) => (await get(n.token, ruta('summary', n, extra))).body.visits;
      expect(await visitas('&range=7d')).toEqual({ value: 1, previous: 0 });
      expect(await visitas('&range=30d')).toEqual({ value: 3, previous: 4 });
      expect(await visitas('')).toEqual({ value: 3, previous: 4 });
      expect(await visitas('&range=90d')).toEqual({ value: 15, previous: 0 });
    });

    it('un rango exacto (from y to) se compara con el mismo tamaño justo antes', async () => {
      const n = await negocio();
      await evento(n.leads.id, 'page_view', 5, {}, 3);
      await evento(n.leads.id, 'page_view', 12, {}, 2);
      await evento(n.leads.id, 'page_view', 20, {}, 7);
      const desde = encodeURIComponent(hace(14).toISOString());
      const hasta = encodeURIComponent(hace(7).toISOString());
      // 14 a 7 días atrás: solo el de 12; el anterior, 21 a 14 días: el de 20.
      expect((await get(n.token, ruta('summary', n, `&from=${desde}&to=${hasta}`))).body.visits).toEqual({ value: 2, previous: 7 });
    });

    it('suma lo pagado por divisa sin mezclarlas y saca el ticket promedio; solo cuentan las órdenes pagadas en el periodo', async () => {
      const n = await negocio();
      await orden(n.venta.id, 1000, 'MXN', 'paid', 2);
      await orden(n.venta.id, 500, 'MXN', 'paid', 3);
      await orden(n.venta.id, 40, 'USD', 'paid', 1);
      await orden(n.venta.id, 250, 'MXN', 'paid', 10); // periodo anterior
      await orden(n.venta.id, 9999, 'MXN', 'pending', null);
      await orden(n.venta.id, 9999, 'MXN', 'failed', null);
      await orden(n.venta.id, 9999, 'MXN', 'cancelled', null);
      await orden(n.venta.id, 9999, 'MXN', 'failed', 2); // con fecha de pago pero no pagada: tampoco cuenta
      await orden(n.venta.id, 7777, 'MXN', 'paid', 40); // fuera de los dos
      await orden(n.venta.id, 5555, 'MXN', 'paid', 2, 60); // creada hace mucho, pagada ahora: cuenta por la fecha de pago

      const { body } = await get(n.token, ruta('summary', n, '&range=7d'));
      expect(body.revenue).toEqual([
        { currency: 'MXN', value: 7055, previous: 250 },
        { currency: 'USD', value: 40, previous: 0 },
      ]);
      expect(body.averageTicket).toEqual([
        { currency: 'MXN', value: 2351.67, previous: 250 },
        { currency: 'USD', value: 40, previous: 0 },
      ]);
    });

    it('con funnelId mide solo ese funnel', async () => {
      const n = await negocio();
      await evento(n.leads.id, 'page_view', 1, {}, 3);
      await evento(n.venta.id, 'page_view', 1, {}, 5);
      await orden(n.venta.id, 100, 'MXN', 'paid', 1);
      const solo = (await get(n.token, ruta('summary', n, `&funnelId=${n.leads.id}`))).body;
      expect(solo.visits.value).toBe(3);
      expect(solo.revenue).toEqual([]);
      expect((await get(n.token, ruta('summary', n, `&funnelId=${n.venta.id}`))).body.revenue).toHaveLength(1);
    });

    it('un negocio sin datos ni funnels responde ceros y listas vacías', async () => {
      const n = await crearNegocio(app, config);
      const res = await get(n.token, ruta('summary', n));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        visits: { value: 0, previous: 0 },
        leads: { value: 0, previous: 0 },
        conversion: { value: 0, previous: 0 },
        revenue: [],
        averageTicket: [],
      });
    });
  });

  describe('GET /analytics/funnel-conversion', () => {
    const etapa = (res: request.Response, key: string) => res.body.items.find((item: { key: string }) => item.key === key);

    it('cuenta cada etapa, sin checkout ni pagos si ningún funnel cobra; «oportunidad» es la penúltima etapa y las que siguen', async () => {
      const n = await negocio();
      const [nuevo, contactado, interesado, oportunidad, cliente] = n.etapas.map((e) => e.id) as [string, string, string, string, string];
      await evento(n.leads.id, 'page_view', 2, {}, 100);
      for (const [id, veces] of [[nuevo, 10], [contactado, 6], [interesado, 4], [oportunidad, 3], [cliente, 2]] as const) await lead(n.leads.id, id, 1, {}, veces);
      await lead(n.leads.id, cliente, 40, {}, 9); // fuera del periodo

      const res = await get(n.token, ruta('funnel-conversion', n, `&funnelId=${n.leads.id}`));
      expect(res.body.items.map((item: { key: string }) => item.key)).toEqual(['visits', 'leads', 'opportunities', 'customers']);
      expect(res.body.items).toEqual([
        { key: 'visits', label: 'Visitas', count: 100, percentOfVisits: 100, percentOfPrevious: null },
        { key: 'leads', label: 'Leads', count: 25, percentOfVisits: 25, percentOfPrevious: 25 },
        { key: 'opportunities', label: 'Oportunidades', count: 5, percentOfVisits: 5, percentOfPrevious: 20 },
        { key: 'customers', label: 'Clientes', count: 2, percentOfVisits: 2, percentOfPrevious: 40 },
      ]);
    });

    it('«cliente» es la etapa marcada como ganada, no la última: si el tablero cambia, la cuenta lo sigue', async () => {
      const n = await negocio();
      const [, , interesado, , cliente] = n.etapas as [(typeof n.etapas)[number], (typeof n.etapas)[number], (typeof n.etapas)[number], (typeof n.etapas)[number], (typeof n.etapas)[number]];
      await prisma.leadStage.update({ where: { id: cliente.id }, data: { isWon: false } });
      await prisma.leadStage.update({ where: { id: interesado.id }, data: { isWon: true } });
      await lead(n.leads.id, interesado.id, 1, {}, 3);
      await lead(n.leads.id, cliente.id, 1, {}, 2);
      const res = await get(n.token, ruta('funnel-conversion', n, `&funnelId=${n.leads.id}`));
      expect(etapa(res, 'customers').count).toBe(3);
    });

    it('si el funnel cobra agrega checkout y pagos con sus eventos; sin visitas los porcentajes son nulos', async () => {
      const n = await negocio();
      await evento(n.venta.id, 'page_view', 1, {}, 50);
      await evento(n.venta.id, 'checkout_started', 1, {}, 10);
      await evento(n.venta.id, 'payment_completed', 1, {}, 4);
      await evento(n.venta.id, 'payment_completed', 40, {}, 8); // fuera del periodo
      const res = await get(n.token, ruta('funnel-conversion', n, `&funnelId=${n.venta.id}`));
      expect(res.body.items.map((item: { key: string }) => item.key)).toEqual(['visits', 'leads', 'opportunities', 'checkout', 'payments', 'customers']);
      expect(etapa(res, 'checkout')).toMatchObject({ count: 10, percentOfVisits: 20, percentOfPrevious: null });
      expect(etapa(res, 'payments')).toMatchObject({ count: 4, percentOfVisits: 8, percentOfPrevious: 40 });

      const vacio = await get(n.token, ruta('funnel-conversion', n, `&funnelId=${n.leads.id}`));
      expect(vacio.body.items.map((item: { percentOfVisits: number | null }) => item.percentOfVisits)).toEqual([null, null, null, null]);
      expect(etapa(vacio, 'leads').percentOfPrevious).toBeNull();
    });

    it('sin funnelId mide todos los del negocio, y si alguno cobra aparecen checkout y pagos', async () => {
      const n = await negocio();
      await evento(n.leads.id, 'page_view', 1, {}, 10);
      await evento(n.venta.id, 'page_view', 1, {}, 10);
      await lead(n.leads.id, n.etapas[0]!.id, 1, {}, 2);
      await lead(n.venta.id, n.etapas[4]!.id, 1, {}, 1);
      const res = await get(n.token, ruta('funnel-conversion', n));
      expect(etapa(res, 'visits').count).toBe(20);
      expect(etapa(res, 'leads').count).toBe(3);
      expect(etapa(res, 'customers').count).toBe(1);
      expect(etapa(res, 'checkout')).toBeDefined();
    });
  });

  describe('GET /analytics/sources', () => {
    it('agrupa las visitas por origen, ordena por visitas y calcula porcentaje y cuántas dejaron sus datos', async () => {
      const n = await negocio();
      await evento(n.leads.id, 'page_view', 1, { source: 'instagram' }, 6);
      await evento(n.leads.id, 'page_view', 1, { source: 'google.com' }, 3);
      await evento(n.leads.id, 'page_view', 1, {}, 2);
      await evento(n.leads.id, 'page_view', 1, { source: '   ' }, 1);
      await evento(n.leads.id, 'page_view', 1, { source: 'facebook' }, 3);
      await evento(n.leads.id, 'page_view', 40, { source: 'viejo' }, 9); // fuera del periodo
      await evento(n.leads.id, 'section_view', 1, { source: 'instagram' }, 9); // no es una visita
      await lead(n.leads.id, n.etapas[0]!.id, 1, { utm_source: 'instagram' }, 3);
      await lead(n.leads.id, n.etapas[0]!.id, 1, { referrer: 'https://google.com/buscar' }, 1);
      await lead(n.leads.id, n.etapas[0]!.id, 1, null, 1);
      await lead(n.leads.id, n.etapas[0]!.id, 1, { utm_medium: 'cpc' }, 1);
      await lead(n.leads.id, n.etapas[0]!.id, 40, { utm_source: 'instagram' }, 5); // fuera del periodo

      const res = await get(n.token, ruta('sources', n));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        total: 15,
        items: [
          { source: 'instagram', clicks: 6, percent: 40, conversion: 50 },
          { source: 'Directo', clicks: 3, percent: 20, conversion: 66.7 },
          { source: 'facebook', clicks: 3, percent: 20, conversion: 0 },
          { source: 'google.com', clicks: 3, percent: 20, conversion: 33.3 },
        ],
      });
    });

    it('muestra los 10 orígenes con más visitas, pero el total y los porcentajes cuentan todos', async () => {
      const n = await negocio();
      for (let i = 1; i <= 12; i += 1) await evento(n.leads.id, 'page_view', 1, { source: `origen-${String(i).padStart(2, '0')}` }, i);
      const res = await get(n.token, ruta('sources', n));
      expect(res.body.total).toBe(78);
      expect(res.body.items).toHaveLength(10);
      expect(res.body.items[0]).toMatchObject({ source: 'origen-12', clicks: 12, percent: 15.4 });
      expect(res.body.items.at(-1).source).toBe('origen-03');
    });

    it('los orígenes con las mismas visitas se ordenan por nombre', async () => {
      const n = await negocio();
      for (const source of ['zeta', 'epsilon', 'delta', 'gamma', 'beta', 'alfa']) await evento(n.leads.id, 'page_view', 1, { source }, 2);
      const res = await get(n.token, ruta('sources', n));
      expect(res.body.items.map((item: { source: string }) => item.source)).toEqual(['alfa', 'beta', 'delta', 'epsilon', 'gamma', 'zeta']);
    });

    it('sin visitas responde total 0 y lista vacía', async () => {
      const n = await negocio();
      expect((await get(n.token, ruta('sources', n))).body).toEqual({ total: 0, items: [] });
    });
  });

  describe('GET /analytics/drop-off', () => {
    async function paginaConSecciones(n: Negocio) {
      await put(n.token, `/funnels/${n.leads.id}/content`, {
        blocks: [
          bloque('beneficios', 'beneficios', { items: [{ title: 'Uno', description: 'Dos' }] }, 2),
          bloque('hero', 'encabezado', { title: 'Hola' }, 1),
          bloque('faq', 'faq', { items: [{ question: '¿Sí?', answer: 'Sí' }] }, 3),
        ],
      });
    }

    it('dice qué porcentaje llega a cada sección en el orden de la página y cuántos puntos se pierden', async () => {
      const n = await negocio();
      await paginaConSecciones(n);
      await evento(n.leads.id, 'page_view', 1, {}, 40);
      await evento(n.leads.id, 'section_view', 1, { section: 'hero' }, 40);
      await evento(n.leads.id, 'section_view', 1, { section: 'beneficios' }, 30);
      await evento(n.leads.id, 'section_view', 1, { section: 'faq' }, 10);
      await evento(n.leads.id, 'section_view', 1, { section: 'faq' }, 3);
      await evento(n.leads.id, 'section_view', 40, { section: 'hero' }, 40); // fuera del periodo
      await evento(n.leads.id, 'section_view', 1, { section: 'ya-no-existe' }, 5);
      await evento(n.leads.id, 'button_click', 1, { section: 'faq' }, 20); // otro tipo de evento con la misma propiedad: no es una sección vista

      const res = await get(n.token, ruta('drop-off', n, `&funnelId=${n.leads.id}`));
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([
        { section: 'hero', reachedPercent: 100, dropPoints: 0 },
        { section: 'beneficios', reachedPercent: 75, dropPoints: 25 },
        { section: 'faq', reachedPercent: 33, dropPoints: 42 },
      ]);
    });

    it('nunca pasa de 100%, y una sección que llega a más gente que la anterior no resta puntos', async () => {
      const n = await negocio();
      await paginaConSecciones(n);
      await evento(n.leads.id, 'page_view', 1, {}, 10);
      await evento(n.leads.id, 'section_view', 1, { section: 'hero' }, 25);
      await evento(n.leads.id, 'section_view', 1, { section: 'beneficios' }, 5);
      await evento(n.leads.id, 'section_view', 1, { section: 'faq' }, 8);
      expect((await get(n.token, ruta('drop-off', n, `&funnelId=${n.leads.id}`))).body.items).toEqual([
        { section: 'hero', reachedPercent: 100, dropPoints: 0 },
        { section: 'beneficios', reachedPercent: 50, dropPoints: 50 },
        { section: 'faq', reachedPercent: 80, dropPoints: 0 },
      ]);
    });

    it('la primera sección se compara con el 100% de las visitas: si no la ve todo el mundo, ya se perdió gente', async () => {
      const n = await negocio();
      await paginaConSecciones(n);
      await evento(n.leads.id, 'page_view', 1, {}, 10);
      await evento(n.leads.id, 'section_view', 1, { section: 'hero' }, 6);
      expect((await get(n.token, ruta('drop-off', n, `&funnelId=${n.leads.id}`))).body.items[0]).toEqual({ section: 'hero', reachedPercent: 60, dropPoints: 40 });
    });

    it('sin visitas todas las secciones están en 0; una página sin bloques da lista vacía', async () => {
      const n = await negocio();
      await paginaConSecciones(n);
      expect((await get(n.token, ruta('drop-off', n, `&funnelId=${n.leads.id}`))).body.items.map((i: { reachedPercent: number }) => i.reachedPercent)).toEqual([0, 0, 0]);
      expect((await get(n.token, ruta('drop-off', n, `&funnelId=${n.venta.id}`))).body).toEqual({ items: [] });
    });

    it('exige el funnel (422) y un funnel de otro negocio responde 404', async () => {
      const n = await negocio();
      const otro = await negocio();
      const sin = await get(n.token, ruta('drop-off', n));
      expect(sin.status).toBe(422);
      expect(sin.body.error.details[0].path).toBe('funnelId');
      expect((await get(n.token, ruta('drop-off', n, `&funnelId=${otro.leads.id}`))).status).toBe(404);
    });
  });

  describe('GET /analytics/funnels', () => {
    it('lista cada funnel con sus visitas, leads, conversión e ingresos, del que más leads trae al que menos', async () => {
      const n = await negocio();
      await evento(n.leads.id, 'page_view', 1, {}, 20);
      await lead(n.leads.id, n.etapas[0]!.id, 1, {}, 1);
      await evento(n.leads.id, 'section_view', 1, { section: 'hero' }, 7); // no es una visita
      await evento(n.venta.id, 'page_view', 1, {}, 8);
      await lead(n.venta.id, n.etapas[0]!.id, 1, {}, 4);
      await orden(n.venta.id, 300, 'MXN', 'paid', 1);
      await orden(n.venta.id, 100, 'MXN', 'paid', 9);
      await orden(n.venta.id, 20, 'USD', 'paid', 2);
      await orden(n.leads.id, 50, 'MXN', 'pending', null);
      await orden(n.venta.id, 9999, 'MXN', 'failed', 2); // con fecha de pago pero no pagada: no cuenta
      const otro = await negocio();
      await lead(otro.leads.id, otro.etapas[0]!.id, 1, {}, 50);

      const res = await get(n.token, ruta('funnels', n, '&range=7d'));
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([
        {
          funnelId: n.venta.id,
          name: 'Venta',
          objective: 'venta',
          status: 'draft',
          visits: 8,
          leads: 4,
          conversion: 50,
          revenue: [{ currency: 'MXN', value: 300, previous: 100 }, { currency: 'USD', value: 20, previous: 0 }],
        },
        { funnelId: n.leads.id, name: 'Leads', objective: 'leads', status: 'draft', visits: 20, leads: 1, conversion: 5, revenue: [] },
      ]);
    });

    it('con el mismo número de leads se ordena por nombre; con funnelId solo muestra ese; un funnel sin visitas tiene conversión 0', async () => {
      const n = await negocio();
      expect((await get(n.token, ruta('funnels', n))).body.items.map((i: { name: string }) => i.name)).toEqual(['Leads', 'Venta']);
      expect((await get(n.token, ruta('funnels', n, `&funnelId=${n.venta.id}`))).body.items).toHaveLength(1);
      expect((await get(n.token, ruta('funnels', n))).body.items[0].conversion).toBe(0);
    });

    it('un negocio sin funnels responde lista vacía', async () => {
      const n = await crearNegocio(app, config);
      expect((await get(n.token, ruta('funnels', n))).body).toEqual({ items: [] });
    });
  });

  describe('la consulta', () => {
    it('rechaza con 422 lo que no es válido y no responde nada', async () => {
      const n = await negocio();
      const caso = async (extra: string, campo: string) => {
        const res = await get(n.token, ruta('summary', n, extra));
        expect(res.status, extra).toBe(422);
        expect(res.body.error.details.map((d: { path: string }) => d.path), extra).toContain(campo);
      };
      await caso('&range=1y', 'range');
      await caso('&range=7d&from=2026-01-01&to=2026-02-01', 'range');
      await caso('&from=2026-01-01', 'to');
      await caso('&to=2026-01-01', 'from');
      await caso('&from=2026-02-01&to=2026-01-01', 'to');
      await caso('&from=2026-01-01&to=2026-01-01', 'to');
      await caso('&from=2025-01-01&to=2026-06-01', 'to');
      await caso('&from=ayer&to=hoy', 'from');
      await caso('&funnelId=no-es-un-id', 'funnelId');
      expect((await get(n.token, '/analytics/summary')).status).toBe(422);
      expect((await get(n.token, '/analytics/summary?workspaceId=no-es-un-id')).status).toBe(422);
      expect((await get(n.token, ruta('summary', n, '&from=2025-10-01&to=2026-10-01'))).status).toBe(200);
      // El tope es de 366 días: ese número exacto vale y un día más no.
      expect((await get(n.token, ruta('summary', n, '&from=2025-10-01&to=2026-10-02'))).status).toBe(200);
      await caso('&from=2025-10-01&to=2026-10-03', 'to');
    });

    it('acepta fechas sin hora (medianoche UTC) y con hora', async () => {
      const n = await negocio();
      expect((await get(n.token, ruta('summary', n, '&from=2026-09-01&to=2026-10-01'))).status).toBe(200);
      expect((await get(n.token, ruta('summary', n, '&from=2026-09-01T10:00:00Z&to=2026-10-01T10:00:00-06:00'))).status).toBe(200);
    });
  });

  describe('permisos', () => {
    it('el diseñador no ve el dashboard (403); el marketing manager, el vendedor y el analista sí', async () => {
      const n = await negocio();
      await evento(n.leads.id, 'page_view', 1, {}, 3);
      const disenador = await miembro(n.workspace.id, 'disenador');
      for (const endpoint of ['summary', 'funnel-conversion', 'sources', 'funnels']) expect((await get(disenador.token, ruta(endpoint, n))).status, endpoint).toBe(403);
      expect((await get(disenador.token, ruta('drop-off', n, `&funnelId=${n.leads.id}`))).status).toBe(403);

      for (const role of ['marketing_manager', 'vendedor', 'analista'] as const) {
        const persona = await miembro(n.workspace.id, role);
        const res = await get(persona.token, ruta('summary', n));
        expect(res.status, role).toBe(200);
        expect(res.body.visits.value, role).toBe(3);
      }
    });

    it('un negocio de otro cliente responde 404 y sin sesión 401', async () => {
      const n = await negocio();
      const ajeno = await crearNegocio(app, config);
      for (const endpoint of ['summary', 'funnel-conversion', 'sources', 'funnels']) {
        expect((await get(ajeno.token, ruta(endpoint, n))).status, endpoint).toBe(404);
        expect((await request(app).get(`/api/v1${ruta(endpoint, n)}`)).status, endpoint).toBe(401);
      }
      expect((await get(ajeno.token, ruta('drop-off', n, `&funnelId=${n.leads.id}`))).status).toBe(404);
      // Un funnel de otro negocio dentro del propio tampoco se mide.
      expect((await get(n.token, ruta('summary', n, `&funnelId=${ajeno.workspace.id}`))).status).toBe(404);
    });
  });
});
