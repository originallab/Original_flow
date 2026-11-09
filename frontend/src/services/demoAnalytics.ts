import { FUNNEL_TYPES } from '@/shared/funnelTypes';
import { RANGES, type AnalyticsSummary, type ConversionStage, type DropOffRow, type FunnelPerformance, type Money, type SourceRow, type StageKey } from './analytics';
import { done, invalid, notFound, skip, type Answer, type DemoDb, type DemoEvent, type DemoLead, type FunnelsContext } from './demoCore';
import { stagesOf } from './demoLeads';
import type { Funnel } from './funnels';

/**
 * La analítica del dashboard en la demostración (ver demo.ts). Calcula todo con lo que hay guardado
 * —leads, eventos y funnels— con las mismas definiciones que debe seguir el backend (docs/API_MVP.md).
 * Los ingresos salen de las órdenes pagadas (por divisa); sin ventas, vacíos.
 */

const DAY = 86_400_000;
const MAX_SOURCES = 10;

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
/** Porcentaje con un decimal; 0 si no hay con qué comparar. */
const percent = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : 0);

interface Scope {
  db: DemoDb;
  funnels: Funnel[];
  /** Ventana actual y anterior, en milisegundos. */
  current: [number, number];
  previous: [number, number];
}

const within = (iso: string, [from, to]: [number, number]) => {
  const time = Date.parse(iso);
  return time >= from && time < to;
};

const leadsOf = (scope: Scope, window: [number, number]) => {
  const ids = new Set(scope.funnels.map((f) => f.id));
  return scope.db.leads.filter((lead) => ids.has(lead.funnelId) && within(lead.createdAt, window));
};
const eventsOf = (scope: Scope, type: string, window: [number, number]) => {
  const ids = new Set(scope.funnels.map((f) => f.id));
  return scope.db.events.filter((event) => event.type === type && ids.has(event.funnelId) && within(event.createdAt, window));
};

/** Ingresos y ticket promedio por divisa, de las órdenes pagadas en el periodo y en el anterior. Nunca se suman monedas distintas. */
function moneyOf(scope: Scope): { revenue: Money[]; averageTicket: Money[] } {
  const ids = new Set(scope.funnels.map((f) => f.id));
  const totals = (window: [number, number]) => {
    const byCurrency = new Map<Money['currency'], { sum: number; count: number }>();
    for (const order of scope.db.orders) {
      if (order.status !== 'paid' || !order.paidAt || !ids.has(order.funnelId) || !within(order.paidAt, window)) continue;
      const current = byCurrency.get(order.currency) ?? { sum: 0, count: 0 };
      byCurrency.set(order.currency, { sum: current.sum + order.amount, count: current.count + 1 });
    }
    return byCurrency;
  };
  const now = totals(scope.current);
  const before = totals(scope.previous);
  const currencies = [...new Set([...now.keys(), ...before.keys()])].sort();
  const average = (entry?: { sum: number; count: number }) => (entry && entry.count > 0 ? round(entry.sum / entry.count, 2) : 0);
  return {
    revenue: currencies.map((currency) => ({ currency, value: round(now.get(currency)?.sum ?? 0, 2), previous: round(before.get(currency)?.sum ?? 0, 2) })),
    averageTicket: currencies.map((currency) => ({ currency, value: average(now.get(currency)), previous: average(before.get(currency)) })),
  };
}

/** De dónde llegó un lead: la misma regla con la que la página manda el origen de cada visita. */
function leadSource(lead: DemoLead): string {
  const source = lead.utm.utm_source?.trim();
  if (source) return source;
  try {
    const host = lead.utm.referrer ? new URL(lead.utm.referrer).hostname : '';
    if (host) return host;
  } catch {
    // Un referente que no es una dirección no cuenta.
  }
  return 'Directo';
}
const eventSource = (event: DemoEvent) => event.properties.source?.trim() || 'Directo';

function summary(scope: Scope): AnalyticsSummary {
  const of = (window: [number, number]) => {
    const visits = eventsOf(scope, 'page_view', window).length;
    const leads = leadsOf(scope, window).length;
    return { visits, leads, conversion: percent(leads, visits) };
  };
  const now = of(scope.current);
  const before = of(scope.previous);
  return {
    visits: { value: now.visits, previous: before.visits },
    leads: { value: now.leads, previous: before.leads },
    conversion: { value: now.conversion, previous: before.conversion },
    ...moneyOf(scope),
  };
}

function conversion(scope: Scope): ConversionStage[] {
  const leads = leadsOf(scope, scope.current);
  // «Oportunidad» es la penúltima etapa del tablero y las que siguen; «Cliente», la etapa ganada.
  const byWorkspace = new Map<string, ReturnType<typeof stagesOf>>();
  for (const funnel of scope.funnels) if (!byWorkspace.has(funnel.workspaceId)) byWorkspace.set(funnel.workspaceId, stagesOf(scope.db, funnel.workspaceId));
  const stageOf = (lead: DemoLead) => {
    const funnel = scope.funnels.find((f) => f.id === lead.funnelId);
    const stages = (funnel && byWorkspace.get(funnel.workspaceId)) || [];
    return { stage: stages.find((s) => s.id === lead.leadStageId) ?? stages[0], stages };
  };
  const opportunities = leads.filter((lead) => {
    const { stage, stages } = stageOf(lead);
    return stage !== undefined && stage.order >= (stages[Math.max(0, stages.length - 2)]?.order ?? Infinity);
  }).length;
  const customers = leads.filter((lead) => stageOf(lead).stage?.isWon).length;
  const charges = scope.funnels.some((funnel) => FUNNEL_TYPES[funnel.objective].charges);

  const counts: [StageKey, string, number][] = [
    ['visits', 'Visitas', eventsOf(scope, 'page_view', scope.current).length],
    ['leads', 'Leads', leads.length],
    ['opportunities', 'Oportunidades', opportunities],
    ...(charges ? ([['checkout', 'Checkout', eventsOf(scope, 'checkout_started', scope.current).length], ['payments', 'Pagos', eventsOf(scope, 'payment_completed', scope.current).length]] as [StageKey, string, number][]) : []),
    ['customers', 'Clientes', customers],
  ];
  const visits = counts[0]![2];
  return counts.map(([key, label, count], index) => {
    const before = counts[index - 1]?.[2];
    return {
      key,
      label,
      count,
      percentOfVisits: visits > 0 ? percent(count, visits) : null,
      percentOfPrevious: index === 0 || !before ? null : percent(count, before),
    };
  });
}

function sources(scope: Scope): { total: number; items: SourceRow[] } {
  const views = eventsOf(scope, 'page_view', scope.current);
  const leads = leadsOf(scope, scope.current);
  const clicks = new Map<string, number>();
  for (const view of views) clicks.set(eventSource(view), (clicks.get(eventSource(view)) ?? 0) + 1);
  const items = [...clicks.entries()]
    .map(([source, count]) => ({ source, clicks: count, percent: percent(count, views.length), conversion: percent(leads.filter((lead) => leadSource(lead) === source).length, count) }))
    .sort((a, b) => b.clicks - a.clicks || a.source.localeCompare(b.source))
    .slice(0, MAX_SOURCES);
  return { total: views.length, items };
}

function dropOff(scope: Scope, funnel: Funnel): DropOffRow[] {
  const visits = eventsOf(scope, 'page_view', scope.current).length;
  const views = eventsOf(scope, 'section_view', scope.current);
  let before = 100;
  return [...funnel.content.blocks]
    .sort((a, b) => a.order - b.order)
    .map((block) => {
      const reached = visits > 0 ? Math.min(100, Math.round((views.filter((view) => view.properties.section === block.key).length / visits) * 100)) : 0;
      const row = { section: block.key, reachedPercent: reached, dropPoints: Math.max(0, before - reached) };
      before = reached;
      return row;
    });
}

function performance(scope: Scope): FunnelPerformance[] {
  return scope.funnels
    .map((funnel) => {
      const own: Scope = { ...scope, funnels: [funnel] };
      const visits = eventsOf(own, 'page_view', scope.current).length;
      const leads = leadsOf(own, scope.current).length;
      return { funnelId: funnel.id, name: funnel.name, objective: funnel.objective, status: funnel.status, visits, leads, conversion: percent(leads, visits), revenue: moneyOf(own).revenue };
    })
    .sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));
}

export function demoAnalyticsRoute({ route, query, method, db, sessionOf }: FunnelsContext): Answer {
  const endpoint = /^\/analytics\/(summary|funnel-conversion|sources|drop-off|funnels)$/.exec(route)?.[1];
  if (!endpoint || method !== 'GET') return skip;

  const session = sessionOf();
  const workspaceId = query.get('workspaceId');
  if (!workspaceId) throw invalid([{ path: 'workspaceId', message: 'Requerido' }]);
  const workspace = db.workspaces.find((w) => w.id === workspaceId && w.ownerEmail === session.email);
  if (!workspace) throw notFound('WORKSPACE_NOT_FOUND', 'Negocio no encontrado');

  const rangeText = query.get('range') ?? '30d';
  const range = RANGES.find((item) => item.value === rangeText);
  if (!range) throw invalid([{ path: 'range', message: 'Debe ser 7d, 30d o 90d' }]);

  const own = db.funnels.filter((funnel) => funnel.workspaceId === workspace.id);
  const funnelId = query.get('funnelId');
  const chosen = funnelId ? own.find((funnel) => funnel.id === funnelId) : undefined;
  if (funnelId && !chosen) throw notFound('FUNNEL_NOT_FOUND', 'Funnel no encontrado');

  const now = Date.now() + 1;
  const scope: Scope = { db, funnels: chosen ? [chosen] : own, current: [now - range.days * DAY, now], previous: [now - 2 * range.days * DAY, now - range.days * DAY] };

  switch (endpoint) {
    case 'summary':
      return done(summary(scope));
    case 'funnel-conversion':
      return done({ items: conversion(scope) });
    case 'sources':
      return done(sources(scope));
    case 'drop-off':
      // Las secciones son de una página: sin funnel no hay con qué comparar.
      if (!chosen) throw invalid([{ path: 'funnelId', message: 'Requerido' }]);
      return done({ items: dropOff(scope, chosen) });
    default:
      return done({ items: performance(scope) });
  }
}
