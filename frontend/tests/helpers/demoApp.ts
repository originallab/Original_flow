import { vi } from 'vitest';
import { sessionStore } from '@/features/auth/sessionStore';
import { EMPTY_BRIEF, type Brief } from '@/features/funnels/catalog';
import { buildPage } from '@/features/funnels/generation/templateGenerator';
import { createSession, mockCallback } from '@/services/auth';
import { createFunnel, saveContent, saveDesignSpec, saveTypeConfig, updateFunnel, type Funnel, type FunnelObjective } from '@/services/funnels';
import { FUNNEL_TYPES, validateTypeConfig } from '@/shared/funnelTypes';
import { createWorkspace, updateWorkspace, type BrandPalette, type Workspace } from '@/services/workspaces';
import type { Block, DesignSpec, TemplateId } from '@/shared/blocks/types';

/**
 * Prepara una persona con sesión y un negocio en el modo demostración (la aplicación responde sola,
 * sin servidor). Va dentro de cada prueba o de su `beforeEach`; `setup.ts` apaga el modo antes de cada una.
 * Si algo intentara usar la red, la prueba lo notaría: `fetch` falla.
 */
export async function startDemo({ email = 'ana@correo.com', name = 'Ana', workspace = 'Academia Nimbral', brandPalette }: { email?: string; name?: string; workspace?: string; brandPalette?: BrandPalette } = {}) {
  vi.stubEnv('VITE_DEMO_MODE', 'true');
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Sin servidor: el modo demostración no debe llamar a la red'));
  const { session } = await createSession();
  await mockCallback(session, { email, name });
  sessionStore.set(session);
  let negocio: Workspace = await createWorkspace(session, { name: workspace });
  if (brandPalette) negocio = await updateWorkspace(session, negocio.id, { brandPalette });
  return { token: session, workspace: negocio };
}

/** Un funnel ya armado como lo deja el asistente (por defecto, de captar leads con la plantilla «claridad»). */
export async function seedFunnel(
  token: string,
  workspace: Workspace,
  { name = 'Mi funnel', objective = 'leads', templateId = 'claridad', brief = {}, blocks, design, typeConfig, price }: { name?: string; objective?: FunnelObjective; templateId?: TemplateId; brief?: Partial<Brief>; blocks?: Block[]; design?: DesignSpec; typeConfig?: Record<string, unknown> | null; price?: number } = {},
): Promise<Funnel> {
  const funnel = await createFunnel(token, { workspaceId: workspace.id, name, objective });
  const page = buildPage({ workspace, objective, brief: { ...EMPTY_BRIEF, ...brief }, templateId });
  await saveDesignSpec(token, funnel.id, design ?? page.designSpec);
  await saveContent(token, funnel.id, blocks ?? page.blocks);
  // Como el asistente: los ajustes del tipo quedan listos si no piden datos que solo la persona sabe.
  const config = typeConfig === undefined ? FUNNEL_TYPES[objective].initial() : typeConfig;
  if (config && validateTypeConfig(objective, config).length === 0) await saveTypeConfig(token, funnel.id, config);
  if (price !== undefined) await updateFunnel(token, funnel.id, { price });
  return funnel;
}

/** Un bloque a mano, con el estilo vacío. */
export const block = (key: string, type: Block['type'], content: Record<string, unknown>, order = 1): Block => ({ key, type, order, content, style: {} });
