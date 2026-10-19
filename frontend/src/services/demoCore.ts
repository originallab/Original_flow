import { ApiError } from './apiError';
import type { Funnel } from './funnels';
import type { Workspace } from './workspaces';

/** Piezas comunes del modo demostración (ver demo.ts): la «base de datos» en el navegador y los errores con el formato del backend. */

export interface DemoSession {
  email: string;
  name: string | null;
  validated: boolean;
}

export type DemoWorkspace = Workspace & { ownerEmail: string };

export interface DemoDb {
  sessions: Record<string, DemoSession>;
  workspaces: DemoWorkspace[];
  funnels: Funnel[];
}

export const uuid = () => crypto.randomUUID();
export const fail = (status: number, code: string, message: string, details: unknown = {}) => new ApiError(status, code, message, details, 'req_demo');
export const unauthorized = () => fail(401, 'UNAUTHORIZED', 'Autenticación requerida o inválida');
export const notFound = (code = 'NOT_FOUND', message = 'Recurso no encontrado') => fail(404, code, message);
export const invalid = (details: { path: string; message: string }[]) => fail(422, 'VALIDATION_ERROR', 'Datos inválidos', details);
export const asObject = (body: unknown): Record<string, unknown> => (body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {});
