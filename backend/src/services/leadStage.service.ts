import { AppError } from '../lib/errors.js';
import { toPage, type Page } from '../lib/pagination.js';
import { isForeignKeyViolation } from '../lib/prismaErrors.js';
import type { LeadStageModel, LeadStageRecord } from '../models/leadStage.model.js';
import type { CreateStageBody, UpdateStageBody } from '../schemas/lead.schemas.js';
import type { AccessService } from './access.service.js';
import type { AuditService } from './audit.service.js';
import type { RequestContext } from './auth.service.js';
import { assertCan } from './permissions.js';

interface Deps {
  stages: LeadStageModel;
  access: AccessService;
  audit: AuditService;
}

/**
 * Las etapas del tablero de leads de cada negocio. Todos los que ven los leads ven las etapas; solo el
 * administrador las cambia. La etapa final (la que pasa a «cliente» al pagar) siempre queda al final del
 * tablero y no se puede mover ni quitar; tampoco una etapa que todavía tiene leads.
 */
export function createLeadStageService({ stages, access, audit }: Deps) {
  async function workspaceFor(userId: string, workspaceId: string) {
    const resolved = await access.resolve(userId, workspaceId);
    if (!resolved) throw AppError.notFound('WORKSPACE_NOT_FOUND', 'Workspace no encontrado');
    return resolved;
  }

  /** Carga una etapa verificando acceso y permiso: la de un negocio ajeno responde 404. */
  async function load(userId: string, stageId: string) {
    const stage = await stages.findById(stageId);
    const resolved = stage ? await access.resolve(userId, stage.workspaceId) : null;
    if (!stage || !resolved) throw AppError.notFound('STAGE_NOT_FOUND', 'Etapa no encontrada');
    assertCan(resolved.role, 'stage:manage');
    return stage;
  }

  const record = (action: string, stage: LeadStageRecord, userId: string, ctx: RequestContext) =>
    audit.record({ action, resourceType: 'lead_stage', resourceId: stage.id, workspaceId: stage.workspaceId, userId, ip: ctx.ip });

  return {
    /** GET /workspaces/:id/lead-stages: las etapas del tablero, en orden. */
    async list(userId: string, workspaceId: string): Promise<Page<LeadStageRecord>> {
      assertCan((await workspaceFor(userId, workspaceId)).role, 'lead:read');
      const items = await stages.list(workspaceId);
      // Son pocas y se muestran todas juntas: una sola página.
      return toPage(items, items.length, { page: 1, pageSize: Math.max(items.length, 1) });
    },

    /** POST /workspaces/:id/lead-stages: agrega una etapa propia (sin posición, justo antes de la final). */
    async create(userId: string, workspaceId: string, body: CreateStageBody, ctx: RequestContext): Promise<LeadStageRecord> {
      assertCan((await workspaceFor(userId, workspaceId)).role, 'stage:manage');
      const created = await stages.create(workspaceId, body.name, body.order);
      await record('lead_stage.create', created, userId, ctx);
      return created;
    },

    /** PATCH /lead-stages/:id: renombra, reordena o ambas. La etapa final no se mueve (`409 STAGE_PROTECTED`). */
    async update(userId: string, stageId: string, body: UpdateStageBody, ctx: RequestContext): Promise<LeadStageRecord> {
      const stage = await load(userId, stageId);
      const moves = body.order !== undefined && body.order !== stage.order;
      if (moves && stage.isFinal) {
        throw AppError.conflict('STAGE_PROTECTED', 'La etapa final siempre queda al final del tablero');
      }

      let updated = stage;
      if (body.name !== undefined && body.name !== stage.name) updated = await stages.rename(stage.id, body.name);
      if (moves && body.order !== undefined) updated = await stages.move(stage.workspaceId, stage.id, body.order);
      await record('lead_stage.update', updated, userId, ctx);
      return updated;
    },

    /** DELETE /lead-stages/:id: quita la etapa. `409 STAGE_PROTECTED` si es la final o la ganada; `409 STAGE_NOT_EMPTY` si tiene leads. */
    async remove(userId: string, stageId: string, ctx: RequestContext): Promise<void> {
      const stage = await load(userId, stageId);
      if (stage.isFinal || stage.isWon) {
        throw AppError.conflict('STAGE_PROTECTED', 'Esta etapa no se puede quitar: es la que se usa al cobrar');
      }
      const leads = await stages.countLeads(stage.id);
      if (leads > 0) throw AppError.conflict('STAGE_NOT_EMPTY', 'Mueve primero los leads de esta etapa', { leads });
      try {
        await stages.remove(stage.workspaceId, stage.id);
      } catch (err) {
        // Llegó un lead a esta etapa entre la cuenta y el borrado.
        if (isForeignKeyViolation(err)) throw AppError.conflict('STAGE_NOT_EMPTY', 'Mueve primero los leads de esta etapa');
        throw err;
      }
      await record('lead_stage.delete', stage, userId, ctx);
    },
  };
}

export type LeadStageService = ReturnType<typeof createLeadStageService>;
