import { MAX_LEAD_VALUE, validateContactChanges, validateManualLead, type ManualLeadBody } from '@/shared/leads';
import { done, invalid, notFound, skip, uuid, type Answer, type DemoDb, type DemoLead, type FunnelsContext } from './demoCore';
import { teamOf } from './demoMembers';
import type { Lead, LeadStage } from './leads';

/**
 * Los leads y las etapas de su tablero en la demostración (ver demo.ts), con las reglas del backend real:
 * solo se ven los de los negocios de la persona (lo ajeno responde 404, nunca 403) y una etapa solo
 * puede ser de ese mismo negocio.
 */

const DEFAULT_STAGES = ['Nuevo', 'Contactado', 'Interesado', 'Oportunidad', 'Cliente'];
const MAX_VALUE = MAX_LEAD_VALUE;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Las etapas del tablero del negocio, en orden. Si todavía no tiene (un negocio anterior a los leads), nacen las cinco de siempre. */
export function stagesOf(db: DemoDb, workspaceId: string): LeadStage[] {
  let stages = db.leadStages.filter((stage) => stage.workspaceId === workspaceId);
  if (stages.length === 0) {
    stages = DEFAULT_STAGES.map((name, index) => ({
      id: uuid(),
      workspaceId,
      name,
      order: index + 1,
      isFinal: index === DEFAULT_STAGES.length - 1,
      isWon: index === DEFAULT_STAGES.length - 1,
    }));
    db.leadStages.push(...stages);
  }
  return [...stages].sort((a, b) => a.order - b.order);
}

/** El lead como lo devuelve la API: con el nombre de su funnel y siempre con una etapa. */
function view(db: DemoDb, lead: DemoLead): Lead {
  const funnel = db.funnels.find((f) => f.id === lead.funnelId);
  const stages = funnel ? stagesOf(db, funnel.workspaceId) : [];
  const stageId = stages.some((stage) => stage.id === lead.leadStageId) ? (lead.leadStageId as string) : (stages[0]?.id ?? '');
  const hasUtm = Object.keys(lead.utm).length > 0;
  return {
    id: lead.id,
    funnelId: lead.funnelId,
    funnelName: funnel?.name ?? '',
    leadStageId: stageId,
    name: lead.name ?? null,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    source: lead.source,
    utm: hasUtm ? lead.utm : null,
    assignedTo: lead.assignedTo ?? null,
    value: lead.value ?? null,
    customFields: Object.keys(lead.customFields).length > 0 ? lead.customFields : null,
    createdAt: lead.createdAt,
  };
}

const text = (lead: Lead) => [lead.name, lead.email, lead.phone].filter(Boolean).join(' ').toLowerCase();

export function demoLeadsRoute({ route, query, method, data, db, sessionOf, save }: FunnelsContext): Answer {
  const ownWorkspace = (id: string) => {
    const session = sessionOf();
    const workspace = db.workspaces.find((w) => w.id === id && w.ownerEmail === session.email);
    if (!workspace) throw notFound('WORKSPACE_NOT_FOUND', 'Negocio no encontrado');
    return workspace;
  };

  const stagesRoute = /^\/workspaces\/([^/]+)\/lead-stages$/.exec(route);
  if (stagesRoute && method === 'GET') {
    const workspace = ownWorkspace(decodeURIComponent(stagesRoute[1] ?? ''));
    const before = db.leadStages.length;
    const items = stagesOf(db, workspace.id);
    if (db.leadStages.length !== before) save();
    return done({ items, total: items.length, page: 1, pageSize: items.length });
  }

  if (route === '/leads' && method === 'GET') {
    const workspaceId = query.get('workspaceId');
    if (!workspaceId) throw invalid([{ path: 'workspaceId', message: 'Requerido' }]);
    const workspace = ownWorkspace(workspaceId);
    const funnelIds = new Set(db.funnels.filter((f) => f.workspaceId === workspace.id).map((f) => f.id));
    const funnelId = query.get('funnelId');
    const stageId = query.get('stageId');
    const q = query.get('q')?.trim().toLowerCase();

    let items = db.leads.filter((lead) => funnelIds.has(lead.funnelId)).map((lead) => view(db, lead));
    if (funnelId) items = items.filter((lead) => lead.funnelId === funnelId);
    if (stageId) items = items.filter((lead) => lead.leadStageId === stageId);
    if (q) items = items.filter((lead) => text(lead).includes(q));
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.get('pageSize')) || DEFAULT_PAGE_SIZE));
    const page = Math.max(1, Number(query.get('page')) || 1);
    return done({ items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize });
  }

  if (route === '/leads' && method === 'POST') {
    const funnel = db.funnels.find((f) => f.id === data.funnelId);
    const workspace = funnel && db.workspaces.find((w) => w.id === funnel.workspaceId && w.ownerEmail === sessionOf().email);
    if (!funnel || !workspace) throw notFound('FUNNEL_NOT_FOUND', 'Funnel no encontrado');

    const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : undefined);
    const body: ManualLeadBody = {
      funnelId: funnel.id,
      name: text('name'),
      email: text('email'),
      phone: text('phone'),
      value: typeof data.value === 'number' ? data.value : undefined,
      source: data.source === 'whatsapp' ? 'whatsapp' : 'web_form',
    };
    const errors = validateManualLead(body).map((issue) => ({ path: String(issue.path[0]), message: issue.message }));
    if (data.source !== undefined && data.source !== 'web_form' && data.source !== 'whatsapp') errors.push({ path: 'source', message: 'Debe ser web_form o whatsapp' });
    const stages = stagesOf(db, workspace.id);
    if (data.leadStageId !== undefined && !stages.some((stage) => stage.id === data.leadStageId)) errors.push({ path: 'leadStageId', message: 'La etapa no existe en este negocio' });
    if (errors.length > 0) throw invalid(errors);

    const lead: DemoLead = {
      id: uuid(),
      funnelId: funnel.id,
      ...(body.name === undefined ? {} : { name: body.name.trim() }),
      ...(body.email === undefined ? {} : { email: body.email.trim().toLowerCase() }),
      ...(body.phone === undefined ? {} : { phone: body.phone.trim() }),
      utm: {},
      source: body.source ?? 'web_form',
      customFields: {},
      leadStageId: typeof data.leadStageId === 'string' ? data.leadStageId : stages[0]?.id,
      value: body.value === undefined ? null : Math.round(body.value * 100) / 100,
      createdAt: new Date().toISOString(),
    };
    db.leads.push(lead);
    save();
    return done(view(db, lead));
  }

  const one = /^\/leads\/([^/]+)$/.exec(route);
  if (one && method === 'PATCH') {
    const id = decodeURIComponent(one[1] ?? '');
    const found = db.leads.find((lead) => lead.id === id);
    const funnel = found && db.funnels.find((f) => f.id === found.funnelId);
    const session = sessionOf();
    const workspace = funnel && db.workspaces.find((w) => w.id === funnel.workspaceId && w.ownerEmail === session.email);
    if (!found || !funnel || !workspace) throw notFound('LEAD_NOT_FOUND', 'Lead no encontrado');

    const editable = ['leadStageId', 'value', 'assignedTo', 'name', 'email', 'phone'] as const;
    const errors: { path: string; message: string }[] = [];
    if (!editable.some((key) => data[key] !== undefined)) errors.push({ path: '', message: 'debe enviar al menos un campo' });
    if (data.leadStageId !== undefined && (typeof data.leadStageId !== 'string' || !stagesOf(db, workspace.id).some((stage) => stage.id === data.leadStageId))) {
      errors.push({ path: 'leadStageId', message: 'La etapa no existe en este negocio' });
    }
    const value = data.value;
    if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_VALUE)) {
      errors.push({ path: 'value', message: `Debe ser un número entre 0 y ${MAX_VALUE}` });
    }
    const assignee = data.assignedTo;
    if (assignee !== undefined && assignee !== null && (typeof assignee !== 'string' || !teamOf(db, workspace.id).some((member) => member.status === 'active' && member.userId === assignee))) {
      errors.push({ path: 'assignedTo', message: 'La persona no tiene acceso a este negocio' });
    }
    const contact = { name: data.name as string | null | undefined, email: data.email as string | null | undefined, phone: data.phone as string | null | undefined };
    errors.push(...validateContactChanges({ email: found.email ?? null, phone: found.phone ?? null }, contact).map((issue) => ({ path: String(issue.path[0]), message: issue.message })));
    if (errors.length > 0) throw invalid(errors);

    if (typeof data.leadStageId === 'string') found.leadStageId = data.leadStageId;
    if (value !== undefined) found.value = value === null ? null : Math.round((value as number) * 100) / 100;
    if (assignee !== undefined) found.assignedTo = assignee as string | null;
    for (const key of ['name', 'email', 'phone'] as const) {
      const next = contact[key];
      if (next === undefined) continue;
      if (next === null) delete found[key];
      else found[key] = key === 'email' ? next.trim().toLowerCase() : next.trim();
    }
    save();
    return done(view(db, found));
  }

  return skip;
}
