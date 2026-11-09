import { insertionIndex, MAX_STAGE_ORDER, stageNameProblem, withPlaced } from '@/shared/leadStages';
import { done, fail, invalid, notFound, skip, uuid, type Answer, type DemoDb, type FunnelsContext } from './demoCore';
import { stagesOf } from './demoLeads';
import type { LeadStage } from './leads';

/**
 * Administrar las etapas del tablero de leads en la demostración (ver demo.ts), con las reglas del backend real: los
 * órdenes quedan siempre seguidos (1, 2, 3…), la etapa final siempre queda al final y no se mueve ni se quita, tampoco
 * una etapa con leads, y lo ajeno responde 404.
 */

/** Deja las etapas del negocio con los órdenes 1, 2, 3… según `ordered`. */
function renumber(db: DemoDb, workspaceId: string, ordered: LeadStage[]) {
  ordered.forEach((stage, index) => {
    stage.order = index + 1;
  });
  db.leadStages = [...db.leadStages.filter((stage) => stage.workspaceId !== workspaceId), ...ordered];
}

/** Cuántos leads de los funnels del negocio están hoy en esa etapa (los de antes del tablero cuentan como de la primera). */
function leadsIn(db: DemoDb, stage: LeadStage): number {
  const funnelIds = new Set(db.funnels.filter((funnel) => funnel.workspaceId === stage.workspaceId).map((funnel) => funnel.id));
  const first = stagesOf(db, stage.workspaceId)[0]?.id;
  return db.leads.filter((lead) => funnelIds.has(lead.funnelId) && (lead.leadStageId ?? first) === stage.id).length;
}

export function demoStagesRoute({ route, method, data, db, sessionOf, save }: FunnelsContext): Answer {
  const mine = (workspaceId: string) => db.workspaces.some((w) => w.id === workspaceId && w.ownerEmail === sessionOf().email);

  const nested = /^\/workspaces\/([^/]+)\/lead-stages$/.exec(route);
  if (nested && method === 'POST') {
    const workspaceId = decodeURIComponent(nested[1] ?? '');
    if (!mine(workspaceId)) throw notFound('WORKSPACE_NOT_FOUND', 'Negocio no encontrado');

    const errors: { path: string; message: string }[] = [];
    const problem = stageNameProblem(data.name);
    if (problem) errors.push({ path: 'name', message: problem });
    const order = data.order;
    if (order !== undefined && (typeof order !== 'number' || !Number.isInteger(order) || order < 1 || order > MAX_STAGE_ORDER)) errors.push({ path: 'order', message: 'Debe ser un número entero entre 1 y 100' });
    if (errors.length > 0) throw invalid(errors);

    const stages = stagesOf(db, workspaceId);
    const created: LeadStage = { id: uuid(), workspaceId, name: (data.name as string).trim(), order: 0, isFinal: false, isWon: false };
    renumber(db, workspaceId, withPlaced(stages, created, insertionIndex(stages, order as number | undefined)));
    save();
    return done(created);
  }

  const one = /^\/lead-stages\/([^/]+)$/.exec(route);
  if (one && (method === 'PATCH' || method === 'DELETE')) {
    const id = decodeURIComponent(one[1] ?? '');
    const stage = db.leadStages.find((item) => item.id === id);
    if (!stage || !mine(stage.workspaceId)) throw notFound('STAGE_NOT_FOUND', 'Etapa no encontrada');

    if (method === 'DELETE') {
      if (stage.isFinal || stage.isWon) throw fail(409, 'STAGE_PROTECTED', 'Esta etapa no se puede quitar: es la que se usa al cobrar');
      const leads = leadsIn(db, stage);
      if (leads > 0) throw fail(409, 'STAGE_NOT_EMPTY', 'Mueve primero los leads de esta etapa', { leads });
      renumber(db, stage.workspaceId, stagesOf(db, stage.workspaceId).filter((item) => item.id !== stage.id));
      save();
      return done(undefined);
    }

    const errors: { path: string; message: string }[] = [];
    if (data.name === undefined && data.order === undefined) errors.push({ path: '', message: 'debe enviar al menos un campo' });
    if (data.name !== undefined) {
      const problem = stageNameProblem(data.name);
      if (problem) errors.push({ path: 'name', message: problem });
    }
    const order = data.order;
    if (order !== undefined && (typeof order !== 'number' || !Number.isInteger(order) || order < 1 || order > MAX_STAGE_ORDER)) errors.push({ path: 'order', message: 'Debe ser un número entero entre 1 y 100' });
    if (errors.length > 0) throw invalid(errors);

    const moves = typeof order === 'number' && order !== stage.order;
    if (moves && stage.isFinal) throw fail(409, 'STAGE_PROTECTED', 'La etapa final siempre queda al final del tablero');
    if (typeof data.name === 'string' && data.name.trim() !== stage.name) stage.name = data.name.trim();
    if (moves) {
      const others = stagesOf(db, stage.workspaceId).filter((item) => item.id !== stage.id);
      renumber(db, stage.workspaceId, withPlaced(others, stage, insertionIndex(others, order)));
    }
    save();
    return done(stage);
  }

  return skip;
}
