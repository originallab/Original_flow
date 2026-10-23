import { validateConnection, type PaymentsConnection } from '@/shared/payments';
import { done, invalid, notFound, skip, type Answer, type DemoDb, type FunnelsContext } from './demoCore';
import type { PaymentsStatus } from './payments';

/**
 * Conectar Original Pay a un negocio en la demostración (ver demo.ts), con las reglas del backend: solo
 * quien administra el negocio, la llave se valida pero no se guarda ni se devuelve, y un negocio ajeno
 * responde 404. Nada se cobra de verdad: el cobro lo simula `demoCheckout.ts`.
 */

/** Si el negocio tiene Original Pay conectado y con qué. */
export function paymentsStatusOf(db: DemoDb, workspaceId: string): PaymentsStatus {
  const connection = db.payments[workspaceId];
  return connection ? { connected: true, provider: 'original_pay', currency: connection.currency, methods: connection.methods } : { connected: false };
}

export function demoPaymentsRoute({ route, method, data, db, sessionOf, save }: FunnelsContext): Answer {
  const match = /^\/workspaces\/([^/]+)\/payments$/.exec(route);
  if (!match) return skip;
  const session = sessionOf();
  const id = decodeURIComponent(match[1] ?? '');
  const workspace = db.workspaces.find((w) => w.id === id && w.ownerEmail === session.email);
  if (!workspace) throw notFound('WORKSPACE_NOT_FOUND', 'Negocio no encontrado');

  if (method === 'GET') return done(paymentsStatusOf(db, workspace.id));

  if (method === 'PUT') {
    const issues = validateConnection(data);
    if (issues.length > 0) throw invalid(issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
    const body = data as unknown as PaymentsConnection;
    // La llave se valida y se descarta: en la demostración no hay con quién usarla.
    db.payments[workspace.id] = { currency: body.currency, methods: [...body.methods] };
    save();
    return done(paymentsStatusOf(db, workspace.id));
  }

  return skip;
}
