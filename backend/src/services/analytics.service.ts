import { readBlocks } from '../funnel-types/blocks.js';
import { getFunnelType } from '../funnel-types/index.js';
import type { FunnelObjective } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import { leadSource, moneyRows, percent, windowsFor, type Money, type Window } from '../lib/analytics.js';
import type { AnalyticsModel } from '../models/analytics.model.js';
import type { FunnelModel } from '../models/funnel.model.js';
import type { AnalyticsQuery } from '../schemas/analytics.schemas.js';
import type { AccessService } from './access.service.js';
import { assertCan } from './permissions.js';

/** Cuántos orígenes muestra el panel «De dónde vienen los clics». */
const MAX_SOURCES = 10;

type StageKey = 'visits' | 'leads' | 'opportunities' | 'checkout' | 'payments' | 'customers';

interface Deps {
  analytics: AnalyticsModel;
  funnels: FunnelModel;
  access: AccessService;
}

/** Lo que se está midiendo: los funnels (todos los del negocio, o uno) y el periodo con el anterior. */
interface Scope {
  workspaceId: string;
  funnels: { id: string; name: string; objective: FunnelObjective; status: string }[];
  ids: string[];
  current: Window;
  previous: Window;
}

/**
 * La analítica del dashboard (`/analytics/*`). Todo se calcula en el servidor sobre `Lead`, `Event` y
 * `Order`; el dashboard solo dibuja la respuesta. Cada periodo se compara con el anterior del mismo tamaño.
 */
export function createAnalyticsService({ analytics, funnels, access }: Deps) {
  /** Verifica acceso y permiso (404 si el negocio o el funnel no son de la persona, 403 si su rol no puede) y arma el alcance. */
  async function scopeOf(userId: string, query: AnalyticsQuery): Promise<Scope> {
    const resolved = await access.resolve(userId, query.workspaceId);
    if (!resolved) throw AppError.notFound('WORKSPACE_NOT_FOUND', 'Workspace no encontrado');
    assertCan(resolved.role, 'analytics:read');

    const own = await analytics.funnelsOfWorkspace(query.workspaceId);
    const chosen = query.funnelId ? own.find((funnel) => funnel.id === query.funnelId) : undefined;
    if (query.funnelId && !chosen) throw AppError.notFound('FUNNEL_NOT_FOUND', 'Funnel no encontrado');

    const scoped = chosen ? [chosen] : own;
    return { workspaceId: query.workspaceId, funnels: scoped, ids: scoped.map((funnel) => funnel.id), ...windowsFor(query.period, new Date()) };
  }

  return {
    /** GET /analytics/summary: visitas, leads, conversión, ingresos y ticket promedio, con el periodo anterior. */
    async summary(userId: string, query: AnalyticsQuery) {
      const scope = await scopeOf(userId, query);
      const [visitsNow, visitsBefore, leadsNow, leadsBefore, paidNow, paidBefore] = await Promise.all([
        analytics.countEvents(scope.ids, ['page_view'], scope.current),
        analytics.countEvents(scope.ids, ['page_view'], scope.previous),
        analytics.countLeads(scope.ids, scope.current),
        analytics.countLeads(scope.ids, scope.previous),
        analytics.paidTotals(scope.ids, scope.current),
        analytics.paidTotals(scope.ids, scope.previous),
      ]);
      const now = visitsNow.get('page_view') ?? 0;
      const before = visitsBefore.get('page_view') ?? 0;
      return {
        visits: { value: now, previous: before },
        leads: { value: leadsNow, previous: leadsBefore },
        conversion: { value: percent(leadsNow, now), previous: percent(leadsBefore, before) },
        ...moneyRows(paidNow, paidBefore),
      };
    },

    /**
     * GET /analytics/funnel-conversion: cuántas personas llegan a cada etapa. «Oportunidad» es la penúltima
     * etapa del tablero y las que siguen; «Cliente», la etapa ganada. Checkout y pagos solo cuentan si algún
     * funnel de los medidos cobra.
     */
    async funnelConversion(userId: string, query: AnalyticsQuery) {
      const scope = await scopeOf(userId, query);
      const [events, perStage, stages] = await Promise.all([
        analytics.countEvents(scope.ids, ['page_view', 'checkout_started', 'payment_completed'], scope.current),
        analytics.leadsByStage(scope.ids, scope.current),
        analytics.stagesOfWorkspace(scope.workspaceId),
      ]);
      const countIn = (include: (stage: (typeof stages)[number]) => boolean) => stages.filter(include).reduce((sum, stage) => sum + (perStage.get(stage.id) ?? 0), 0);
      const firstOpportunity = stages[Math.max(0, stages.length - 2)]?.order ?? Infinity;
      const leads = [...perStage.values()].reduce((sum, count) => sum + count, 0);
      const charges = scope.funnels.some((funnel) => getFunnelType(funnel.objective).charges);

      const counts: [StageKey, string, number][] = [
        ['visits', 'Visitas', events.get('page_view') ?? 0],
        ['leads', 'Leads', leads],
        ['opportunities', 'Oportunidades', countIn((stage) => stage.order >= firstOpportunity)],
        ...(charges
          ? ([
              ['checkout', 'Checkout', events.get('checkout_started') ?? 0],
              ['payments', 'Pagos', events.get('payment_completed') ?? 0],
            ] as [StageKey, string, number][])
          : []),
        ['customers', 'Clientes', countIn((stage) => stage.isWon)],
      ];
      const visits = counts[0]?.[2] ?? 0;
      return {
        items: counts.map(([key, label, count], index) => {
          const previous = counts[index - 1]?.[2];
          return {
            key,
            label,
            count,
            percentOfVisits: visits > 0 ? percent(count, visits) : null,
            percentOfPrevious: index === 0 || !previous ? null : percent(count, previous),
          };
        }),
      };
    },

    /** GET /analytics/sources: de dónde vienen las visitas (los 10 mayores), con su porcentaje y cuántas dejaron sus datos. */
    async sources(userId: string, query: AnalyticsQuery) {
      const scope = await scopeOf(userId, query);
      const [views, utms] = await Promise.all([analytics.sourceViews(scope.ids, scope.current), analytics.leadUtms(scope.ids, scope.current)]);
      const leadsBySource = new Map<string, number>();
      for (const { utm, count } of utms) leadsBySource.set(leadSource(utm), (leadsBySource.get(leadSource(utm)) ?? 0) + count);

      const total = views.reduce((sum, row) => sum + row.count, 0);
      const items = views
        .map(({ source, count }) => ({ source, clicks: count, percent: percent(count, total), conversion: percent(leadsBySource.get(source) ?? 0, count) }))
        .sort((a, b) => b.clicks - a.clicks || a.source.localeCompare(b.source))
        .slice(0, MAX_SOURCES);
      return { total, items };
    },

    /** GET /analytics/drop-off: qué porcentaje de las visitas llega a cada sección y cuántos puntos se pierden respecto a la anterior. */
    async dropOff(userId: string, query: AnalyticsQuery & { funnelId: string }) {
      const scope = await scopeOf(userId, query);
      const funnel = await funnels.findById(query.funnelId);
      const [events, sectionViews] = await Promise.all([
        analytics.countEvents(scope.ids, ['page_view'], scope.current),
        analytics.sectionViews(query.funnelId, scope.current),
      ]);
      const visits = events.get('page_view') ?? 0;
      let before = 100;
      const items = readBlocks(funnel?.content)
        .sort((a, b) => a.order - b.order)
        .map((block) => {
          const reachedPercent = visits > 0 ? Math.min(100, Math.round(((sectionViews.get(block.key) ?? 0) / visits) * 100)) : 0;
          const row = { section: block.key, reachedPercent, dropPoints: Math.max(0, before - reachedPercent) };
          before = reachedPercent;
          return row;
        });
      return { items };
    },

    /** GET /analytics/funnels: el rendimiento de cada funnel (visitas, leads, conversión e ingresos), del que más leads trae al que menos. */
    async funnels(userId: string, query: AnalyticsQuery) {
      const scope = await scopeOf(userId, query);
      const [{ views, leads }, paidNow, paidBefore] = await Promise.all([
        analytics.viewsAndLeadsByFunnel(scope.ids, scope.current),
        analytics.paidTotalsByFunnel(scope.ids, scope.current),
        analytics.paidTotalsByFunnel(scope.ids, scope.previous),
      ]);
      const items = scope.funnels
        .map((funnel) => {
          const visits = views.get(funnel.id) ?? 0;
          const own = leads.get(funnel.id) ?? 0;
          const revenue: Money[] = moneyRows(
            paidNow.filter((total) => total.funnelId === funnel.id),
            paidBefore.filter((total) => total.funnelId === funnel.id),
          ).revenue;
          return { funnelId: funnel.id, name: funnel.name, objective: funnel.objective, status: funnel.status, visits, leads: own, conversion: percent(own, visits), revenue };
        })
        .sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));
      return { items };
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
