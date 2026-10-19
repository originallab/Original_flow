import { apiFetch } from './api';

export interface BrandPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface Workspace {
  id: string;
  clientId: string;
  name: string;
  country: string | null;
  website: string | null;
  industry: string | null;
  logoFileId: string | null;
  brandPalette: BrandPalette | null;
  createdAt: string;
  /** Rol de quien pregunta en este negocio. */
  role: string;
}

export interface NewWorkspace {
  name: string;
  country?: string;
  website?: string;
  industry?: string;
}

/** Campos editables; con `null` se borra un campo opcional. */
export interface WorkspaceChanges {
  name?: string;
  country?: string | null;
  website?: string | null;
  industry?: string | null;
  brandPalette?: BrandPalette | null;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET /workspaces: los negocios a los que llega la persona. */
export async function listWorkspaces(token: string): Promise<Workspace[]> {
  const page = await apiFetch<Page<Workspace>>('/workspaces?pageSize=100', { token });
  return page.items;
}

/** POST /workspaces: alta del negocio (si la persona no tiene cliente, se crea también). */
export function createWorkspace(token: string, body: NewWorkspace): Promise<Workspace> {
  return apiFetch('/workspaces', { method: 'POST', body, token });
}

/** PATCH /workspaces/:id */
export function updateWorkspace(token: string, id: string, changes: WorkspaceChanges): Promise<Workspace> {
  return apiFetch(`/workspaces/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes, token });
}
