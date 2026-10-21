import { createFunnel, publishFunnel, saveContent, saveTypeConfig, type Funnel } from '@/services/funnels';
import { sendLead } from '@/services/publicPages';
import type { CustomFieldValue, Utm } from '@/shared/leads';
import { FUNNEL_TYPES } from '@/shared/funnelTypes';
import { startDemo } from './demoApp';
import { bloque, editarBaseDeDemostracion, FORMULARIO } from './publicApp';

export interface SeedLead {
  name?: string;
  email?: string;
  phone?: string;
  /** 0 = «Curso de datos», 1 = «Taller de ventas». */
  funnel?: 0 | 1;
  utm?: Utm;
  customFields?: Record<string, CustomFieldValue>;
}

async function publicado(token: string, workspaceId: string, name: string): Promise<Funnel> {
  const funnel = await createFunnel(token, { workspaceId, name, objective: 'leads' });
  await saveContent(token, funnel.id, [bloque('encabezado'), FORMULARIO]);
  await saveTypeConfig(token, funnel.id, FUNNEL_TYPES.leads.initial());
  await publishFunnel(token, funnel.id);
  return funnel;
}

/**
 * Una persona con sesión, un negocio con dos funnels publicados y los leads que llegaron por sus
 * páginas (el primero de la lista es el más viejo). Con `role` se cambia su rol en el negocio y con
 * `email` se usa otra persona (por ejemplo, para probar lo de un negocio ajeno).
 */
export async function negocioConLeads(gente: SeedLead[] = [], { role, email }: { role?: string; email?: string } = {}) {
  const { token, workspace } = await startDemo({ email });
  const funnels = [await publicado(token, workspace.id, 'Curso de datos'), await publicado(token, workspace.id, 'Taller de ventas')] as const;
  for (const persona of gente) {
    const { funnel = 0, ...datos } = persona;
    await sendLead(funnels[funnel].slug, { consent: true, ...datos });
    // Para que cada lead tenga su propia hora de llegada y el orden sea siempre el mismo.
    await new Promise((resolver) => setTimeout(resolver, 3));
  }
  if (role) {
    editarBaseDeDemostracion((db) => {
      db.workspaces[0].role = role;
    });
  }
  return { token, workspace, funnels };
}

const DIA = 86_400_000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA).toISOString();
let contador = 0;

/** Pone eventos en la base de demostración con la fecha que se quiera (`diasAtras` días antes de ahora). */
export function sembrarEvento(funnelId: string, type: string, diasAtras: number, properties: Record<string, string> = {}, veces = 1) {
  editarBaseDeDemostracion((db) => {
    for (let i = 0; i < veces; i++) db.events.push({ id: `ev-${++contador}`, funnelId, type, properties, createdAt: hace(diasAtras) });
  });
}

/** Pone leads en la base de demostración con la fecha que se quiera. */
export function sembrarLead(funnelId: string, diasAtras: number, utm: Record<string, string> = {}, veces = 1) {
  editarBaseDeDemostracion((db) => {
    for (let i = 0; i < veces; i++) db.leads.push({ id: `ld-${++contador}`, funnelId, name: `Lead ${contador}`, email: `l${contador}@correo.com`, utm, source: 'web_form', customFields: {}, value: null, createdAt: hace(diasAtras) });
  });
}
