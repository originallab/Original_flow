import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { PaidTotal, Window } from '../lib/analytics.js';

/**
 * Consultas de solo lectura para la analítica del dashboard. Siempre acotadas a una lista de funnels (los
 * de un workspace, o uno) y a un periodo `[from, to)`. Los conteos y las sumas los hace la base de datos.
 */

const when = (column: 'occurredAt' | 'createdAt' | 'paidAt', { from, to }: Window) => ({ [column]: { gte: from, lt: to } });

/** Las fechas viajan como texto y se leen como UTC, sin depender de la zona horaria de la conexión. */
const instant = (date: Date) => Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

const paidTotal = (row: { currency: string; _sum: { amount: Prisma.Decimal | null }; _count: { _all: number } }): PaidTotal => ({
  currency: row.currency,
  sum: row._sum.amount?.toNumber() ?? 0,
  count: row._count._all,
});

export function createAnalyticsModel(prisma: PrismaClient) {
  return {
    /** Los funnels de un workspace (para el rendimiento y para saber a cuáles pertenece lo que se pide). */
    funnelsOfWorkspace(workspaceId: string) {
      return prisma.funnel.findMany({ where: { workspaceId }, select: { id: true, name: true, objective: true, status: true } });
    },

    /** Las etapas del tablero del workspace, en orden. */
    stagesOfWorkspace(workspaceId: string) {
      return prisma.leadStage.findMany({ where: { workspaceId }, orderBy: { order: 'asc' }, select: { id: true, order: true, isWon: true } });
    },

    /** Cuántos eventos de cada tipo hubo en el periodo. */
    async countEvents(funnelIds: string[], types: string[], window: Window): Promise<Map<string, number>> {
      const rows = await prisma.event.groupBy({
        by: ['type'],
        where: { funnelId: { in: funnelIds }, type: { in: types }, ...when('occurredAt', window) },
        _count: { _all: true },
      });
      return new Map(rows.map((row) => [row.type, row._count._all]));
    },

    countLeads(funnelIds: string[], window: Window): Promise<number> {
      return prisma.lead.count({ where: { funnelId: { in: funnelIds }, ...when('createdAt', window) } });
    },

    /** Cuántos leads llegaron en el periodo y están hoy en cada etapa del tablero. */
    async leadsByStage(funnelIds: string[], window: Window): Promise<Map<string, number>> {
      const rows = await prisma.lead.groupBy({ by: ['leadStageId'], where: { funnelId: { in: funnelIds }, ...when('createdAt', window) }, _count: { _all: true } });
      return new Map(rows.map((row) => [row.leadStageId, row._count._all]));
    },

    /** Lo pagado por divisa: órdenes `paid` cuyo pago cayó en el periodo. */
    async paidTotals(funnelIds: string[], window: Window): Promise<PaidTotal[]> {
      const rows = await prisma.order.groupBy({
        by: ['currency'],
        where: { funnelId: { in: funnelIds }, status: 'paid', ...when('paidAt', window) },
        _sum: { amount: true },
        _count: { _all: true },
      });
      return rows.map(paidTotal);
    },

    /** Visitas (`page_view`) por origen: la propiedad `source` del evento, o «Directo» si no trae. */
    sourceViews(funnelIds: string[], window: Window): Promise<{ source: string; count: number }[]> {
      return prisma.$queryRaw`
        SELECT COALESCE(NULLIF(BTRIM("properties"->>'source'), ''), 'Directo') AS source, COUNT(*)::int AS count
        FROM "Event"
        WHERE "type" = 'page_view' AND "funnelId" = ANY(${funnelIds})
          AND "occurredAt" >= ${instant(window.from)} AND "occurredAt" < ${instant(window.to)}
        GROUP BY 1`;
    },

    /** Los leads del periodo agrupados por su `utm` (hay pocas combinaciones distintas; el origen se saca de cada una). */
    leadUtms(funnelIds: string[], window: Window): Promise<{ utm: unknown; count: number }[]> {
      return prisma.$queryRaw`
        SELECT "utm" AS utm, COUNT(*)::int AS count
        FROM "Lead"
        WHERE "funnelId" = ANY(${funnelIds})
          AND "createdAt" >= ${instant(window.from)} AND "createdAt" < ${instant(window.to)}
        GROUP BY "utm"`;
    },

    /** Cuántas veces entró en pantalla cada sección (`section_view`) de la página. */
    async sectionViews(funnelId: string, window: Window): Promise<Map<string, number>> {
      const rows = await prisma.$queryRaw<{ section: string | null; count: number }[]>`
        SELECT "properties"->>'section' AS section, COUNT(*)::int AS count
        FROM "Event"
        WHERE "type" = 'section_view' AND "funnelId" = ${funnelId}
          AND "occurredAt" >= ${instant(window.from)} AND "occurredAt" < ${instant(window.to)}
        GROUP BY 1`;
      return new Map(rows.flatMap((row) => (row.section === null ? [] : [[row.section, row.count] as const])));
    },

    /** Visitas y leads del periodo, por funnel. */
    async viewsAndLeadsByFunnel(funnelIds: string[], window: Window): Promise<{ views: Map<string, number>; leads: Map<string, number> }> {
      const [views, leads] = await Promise.all([
        prisma.event.groupBy({ by: ['funnelId'], where: { funnelId: { in: funnelIds }, type: 'page_view', ...when('occurredAt', window) }, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ['funnelId'], where: { funnelId: { in: funnelIds }, ...when('createdAt', window) }, _count: { _all: true } }),
      ]);
      return { views: new Map(views.map((row) => [row.funnelId, row._count._all])), leads: new Map(leads.map((row) => [row.funnelId, row._count._all])) };
    },

    /** Lo pagado por funnel y divisa en el periodo. */
    async paidTotalsByFunnel(funnelIds: string[], window: Window): Promise<(PaidTotal & { funnelId: string })[]> {
      const rows = await prisma.order.groupBy({
        by: ['funnelId', 'currency'],
        where: { funnelId: { in: funnelIds }, status: 'paid', ...when('paidAt', window) },
        _sum: { amount: true },
        _count: { _all: true },
      });
      return rows.map((row) => ({ funnelId: row.funnelId, ...paidTotal(row) }));
    },
  };
}

export type AnalyticsModel = ReturnType<typeof createAnalyticsModel>;
