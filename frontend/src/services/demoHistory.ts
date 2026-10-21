import { labelProblem, MAX_LABEL } from '@/shared/history';
import { done, fail, invalid, ownFunnel, recordVersion, skip, type Answer, type DemoDb, type DemoHistoryEntry, type FunnelsContext } from './demoCore';
import { syncCtas } from './demoFunnelActions';
import type { HistoryEntry } from './history';

/**
 * El historial de versiones de un funnel en la demostración (ver demo.ts), con las reglas del backend:
 * publicar guarda una versión «Publicado», cada una es una copia del contenido, el diseño, la marca, el SEO
 * y el flujo, y restaurar guarda primero cómo estaba la página para poder deshacer. Lo ajeno responde 404.
 */

/** La versión como la devuelve la API: sin la copia y con quién la guardó. */
function view(db: DemoDb, entry: DemoHistoryEntry): HistoryEntry {
  const account = Object.values(db.sessions).find((session) => session.validated && session.email === entry.userEmail);
  return { id: entry.id, funnelId: entry.funnelId, label: entry.label, createdAt: entry.createdAt, user: { id: `demo-${entry.userEmail}`, name: account?.name ?? null, email: entry.userEmail } };
}

export function demoHistoryRoute(ctx: FunnelsContext): Answer {
  const { route, method, data, db, save } = ctx;
  const match = /^\/funnels\/([^/]+)\/history(?:\/([^/]+)\/restore)?$/.exec(route);
  if (!match) return skip;
  const funnel = ownFunnel(ctx, decodeURIComponent(match[1] ?? ''));
  const email = ctx.sessionOf().email;
  const historyId = match[2] ? decodeURIComponent(match[2]) : undefined;

  if (!historyId && method === 'GET') {
    // Del más nuevo al más viejo; con la misma hora, la última que se guardó va primero.
    const items = db.history
      .filter((entry) => entry.funnelId === funnel.id)
      .reverse()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((entry) => view(db, entry));
    return done({ items, total: items.length, page: 1, pageSize: 100 });
  }

  if (!historyId && method === 'POST') {
    const problem = labelProblem(data.label);
    if (problem) throw invalid([{ path: 'label', message: problem }]);
    const entry = recordVersion(db, funnel, email, (data.label as string).trim());
    save();
    return done(view(db, entry));
  }

  if (historyId && method === 'POST') {
    const entry = db.history.find((item) => item.id === historyId && item.funnelId === funnel.id);
    if (!entry) throw fail(404, 'HISTORY_NOT_FOUND', 'Versión no encontrada');
    // Primero se guarda cómo está la página ahora: así restaurar se puede deshacer.
    const name = entry.label ? `«${entry.label}»` : 'una versión sin nombre';
    recordVersion(db, funnel, email, `Antes de restaurar ${name}`.slice(0, MAX_LABEL));
    const snapshot = structuredClone(entry.snapshot);
    funnel.content = snapshot.content as typeof funnel.content;
    funnel.designSpec = snapshot.designSpec as typeof funnel.designSpec;
    funnel.brandBrief = snapshot.brandBrief;
    funnel.seo = snapshot.seo;
    funnel.flow = snapshot.flow;
    funnel.updatedAt = new Date().toISOString();
    syncCtas(ctx, funnel);
    save();
    return done(funnel);
  }

  return skip;
}
