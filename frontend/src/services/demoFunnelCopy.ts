import { done, fail, ownFunnel, skip, uuid, type Answer, type FunnelsContext } from './demoCore';
import { syncCtas } from './demoFunnelActions';
import type { Funnel } from './funnels';

/** Copiar y eliminar funnels en el modo demostración, con las mismas reglas y errores que el backend. */
export function demoFunnelCopyRoute(ctx: FunnelsContext): Answer {
  const { route, method, db, save } = ctx;

  const copy = /^\/funnels\/([^/]+)\/duplicate$/.exec(route);
  if (copy && method === 'POST') {
    const source = ownFunnel(ctx, decodeURIComponent(copy[1] ?? ''));
    const name = `Copia de ${source.name}`.slice(0, 120);
    const now = new Date().toISOString();
    let slug = `${source.slug}-copia`;
    while (db.funnels.some((f) => f.slug === slug)) slug = `${source.slug}-copia-${uuid().slice(0, 4)}`;
    const created: Funnel = { ...structuredClone(source), id: uuid(), name, slug, status: 'draft', createdAt: now, updatedAt: now };
    db.funnels.push(created);
    syncCtas(ctx, created);
    save();
    return done(created);
  }

  const one = /^\/funnels\/([^/]+)$/.exec(route);
  if (one && method === 'DELETE') {
    const funnel = ownFunnel(ctx, decodeURIComponent(one[1] ?? ''));
    if (db.orders.some((o) => o.funnelId === funnel.id)) throw fail(409, 'FUNNEL_HAS_ORDERS', 'Un funnel con órdenes no se puede eliminar; despublícalo en su lugar');
    db.funnels = db.funnels.filter((f) => f.id !== funnel.id);
    db.ctas = db.ctas.filter((c) => c.funnelId !== funnel.id);
    save();
    return done(undefined);
  }
  return skip;
}
