import type { LeadSource, MembershipRole } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import { pageToSkipTake, toPage, type Page } from '../lib/pagination.js';
import type { LeadChanges, LeadModel, LeadRecord } from '../models/lead.model.js';
import type { LeadStageModel } from '../models/leadStage.model.js';
import type { CreateLeadBody, ListLeadsQuery, UpdateLeadBody } from '../schemas/lead.schemas.js';
import type { AccessService } from './access.service.js';
import type { AuditService } from './audit.service.js';
import type { RequestContext } from './auth.service.js';
import { assertCan, type Action } from './permissions.js';

/** Un lead como lo muestra el tablero: con el nombre de su funnel, el valor como número y sin datos internos del funnel. */
export interface LeadDto {
  id: string;
  funnelId: string;
  funnelName: string;
  leadStageId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  utm: Record<string, unknown> | null;
  assignedTo: string | null;
  value: number | null;
  customFields: Record<string, unknown> | null;
  createdAt: Date;
}

/** Los campos JSON se leen de forma defensiva: lo que no es un objeto sale como `null`. */
const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export function toLeadDto({ funnel, utm, customFields, value, ...lead }: LeadRecord): LeadDto {
  return { ...lead, funnelName: funnel.name, utm: asObject(utm), customFields: asObject(customFields), value: value ? value.toNumber() : null };
}

const cents = (value: number) => Math.round(value * 100) / 100;

interface Deps {
  leads: LeadModel;
  stages: LeadStageModel;
  access: AccessService;
  audit: AuditService;
}

/**
 * Los leads del tablero: ver, dar de alta a mano y cambiar de etapa, de vendedor, de datos o de valor.
 * Un lead de otro cliente responde 404 (nunca 403). Los datos personales no se escriben en el log de
 * auditoría: solo ids y nombres de campos.
 */
export function createLeadService({ leads, stages, access, audit }: Deps) {
  /** Carga un lead verificando acceso y permiso. */
  async function load(userId: string, leadId: string, action: Action): Promise<{ lead: LeadRecord; role: MembershipRole }> {
    const lead = await leads.findById(leadId);
    const resolved = lead ? await access.resolve(userId, lead.funnel.workspaceId) : null;
    if (!lead || !resolved) throw AppError.notFound('LEAD_NOT_FOUND', 'Lead no encontrado');
    assertCan(resolved.role, action);
    return { lead, role: resolved.role };
  }

  /** La etapa debe ser del tablero de ese negocio; si no, 422 sobre `leadStageId`. */
  async function assertStageOf(workspaceId: string, stageId: string): Promise<void> {
    const stage = await stages.findById(stageId);
    if (!stage || stage.workspaceId !== workspaceId) {
      throw AppError.unprocessable('VALIDATION_ERROR', 'Los datos enviados no son válidos', [{ path: 'leadStageId', message: 'La etapa no existe en este negocio' }]);
    }
  }

  return {
    /** GET /leads: la lista del negocio, del más nuevo al más viejo, con filtros y paginación. */
    async list(userId: string, query: ListLeadsQuery): Promise<Page<LeadDto>> {
      const resolved = await access.resolve(userId, query.workspaceId);
      if (!resolved) throw AppError.notFound('WORKSPACE_NOT_FOUND', 'Workspace no encontrado');
      assertCan(resolved.role, 'lead:read');
      const { workspaceId, funnelId, stageId, source, q } = query;
      const { items, total } = await leads.list({ workspaceId, funnelId, stageId, source, q }, pageToSkipTake(query));
      return toPage(items.map(toLeadDto), total, query);
    },

    /** GET /leads/:id */
    async get(userId: string, leadId: string): Promise<LeadDto> {
      return toLeadDto((await load(userId, leadId, 'lead:read')).lead);
    },

    /** POST /leads: alta manual en un funnel del negocio; sin etapa, entra a la primera del tablero. */
    async create(userId: string, body: CreateLeadBody, ctx: RequestContext): Promise<LeadDto> {
      const funnel = await leads.funnelWorkspace(body.funnelId);
      const resolved = funnel ? await access.resolve(userId, funnel.workspaceId) : null;
      if (!funnel || !resolved) throw AppError.notFound('FUNNEL_NOT_FOUND', 'Funnel no encontrado');
      assertCan(resolved.role, 'lead:manage');

      let leadStageId = body.leadStageId;
      if (leadStageId) {
        await assertStageOf(funnel.workspaceId, leadStageId);
      } else {
        leadStageId = (await leads.firstStageId(funnel.workspaceId)) ?? undefined;
        if (!leadStageId) throw AppError.unprocessable('PIPELINE_NOT_CONFIGURED', 'El negocio todavía no tiene etapas de seguimiento configuradas');
      }

      const created = await leads.create({
        funnelId: funnel.id,
        leadStageId,
        name: body.name,
        email: body.email,
        phone: body.phone,
        value: body.value === undefined ? undefined : cents(body.value),
        source: body.source,
        customFields: body.customFields,
      });
      await audit.record({ action: 'lead.create', resourceType: 'lead', resourceId: created.id, workspaceId: funnel.workspaceId, userId, ip: ctx.ip });
      return toLeadDto(created);
    },

    /**
     * PATCH /leads/:id: cambia de etapa (del mismo negocio), asigna o quita vendedor (alguien con acceso al
     * negocio), corrige datos o pone el valor. El lead siempre conserva un correo o un teléfono.
     */
    async update(userId: string, leadId: string, body: UpdateLeadBody, ctx: RequestContext): Promise<LeadDto> {
      const { lead } = await load(userId, leadId, 'lead:manage');
      const workspaceId = lead.funnel.workspaceId;

      if (body.leadStageId !== undefined) await assertStageOf(workspaceId, body.leadStageId);
      if (body.assignedTo && !(await access.resolve(body.assignedTo, workspaceId))) {
        throw AppError.unprocessable('VALIDATION_ERROR', 'Los datos enviados no son válidos', [{ path: 'assignedTo', message: 'La persona no tiene acceso a este negocio' }]);
      }
      const email = body.email === undefined ? lead.email : body.email;
      const phone = body.phone === undefined ? lead.phone : body.phone;
      if (!email && !phone) {
        throw AppError.unprocessable('VALIDATION_ERROR', 'Los datos enviados no son válidos', [{ path: 'email', message: 'el lead debe conservar un email o un phone' }]);
      }

      const changes: LeadChanges = { ...body, ...(typeof body.value === 'number' ? { value: cents(body.value) } : {}) };
      const updated = await leads.update(lead.id, changes);
      await audit.record({
        action: 'lead.update',
        resourceType: 'lead',
        resourceId: lead.id,
        workspaceId,
        userId,
        ip: ctx.ip,
        metadata: { fields: Object.keys(body), ...(body.leadStageId ? { fromStageId: lead.leadStageId, toStageId: body.leadStageId } : {}) },
      });
      return toLeadDto(updated);
    },
  };
}

export type LeadService = ReturnType<typeof createLeadService>;
