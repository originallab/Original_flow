import { readBlocks } from '../funnel-types/blocks.js';
import { AppError } from '../lib/errors.js';
import { pageToSkipTake, toPage, type Page, type PaginationQuery } from '../lib/pagination.js';
import { readSnapshot, snapshotOf, type FunnelModel } from '../models/funnel.model.js';
import type { FunnelHistoryModel, HistoryEntryRecord } from '../models/funnelHistory.model.js';
import type { AuditService } from './audit.service.js';
import type { RequestContext } from './auth.service.js';
import { desiredCtas } from './funnelContent.service.js';
import type { FunnelDto, FunnelService } from './funnel.service.js';
import { withNumberPrice } from './funnel.service.js';

/** Lo más largo que puede ser el nombre de una versión (el mismo tope que valida el esquema). */
export const MAX_LABEL = 120;

interface Deps {
  funnels: FunnelModel;
  history: FunnelHistoryModel;
  funnelService: FunnelService;
  audit: AuditService;
}

export function createFunnelHistoryService({ funnels, history, funnelService, audit }: Deps) {
  return {
    /** GET /funnels/:id/history: las versiones, de la más nueva a la más vieja, sin su copia. */
    async list(userId: string, funnelId: string, query: PaginationQuery): Promise<Page<HistoryEntryRecord>> {
      const { funnel } = await funnelService.load(userId, funnelId, 'history:read');
      const { items, total } = await history.list(funnel.id, pageToSkipTake(query));
      return toPage(items, total, query);
    },

    /** POST /funnels/:id/history: guarda la página como está ahora con un nombre. */
    async save(userId: string, funnelId: string, label: string, ctx: RequestContext): Promise<HistoryEntryRecord> {
      const { funnel } = await funnelService.load(userId, funnelId, 'history:save');
      const entry = await history.create(funnel.id, userId, label, snapshotOf(funnel));
      await audit.record({
        action: 'funnel.history_save',
        resourceType: 'funnel',
        resourceId: funnel.id,
        workspaceId: funnel.workspaceId,
        userId,
        ip: ctx.ip,
        metadata: { historyId: entry.id },
      });
      return entry;
    },

    /**
     * POST /funnels/:id/history/:historyId/restore: devuelve contenido, diseño, marca, SEO y flujo a como
     * estaban en esa versión (no el nombre, el precio ni los ajustes del tipo). Antes guarda cómo estaba
     * la página en una versión nueva, para poder deshacer. Responde el funnel ya restaurado.
     */
    async restore(userId: string, funnelId: string, historyId: string, ctx: RequestContext): Promise<FunnelDto> {
      const { funnel } = await funnelService.load(userId, funnelId, 'history:restore');
      const entry = await history.findWithSnapshot(funnel.id, historyId);
      if (!entry) throw AppError.notFound('HISTORY_NOT_FOUND', 'Versión no encontrada');

      const snapshot = readSnapshot(entry.snapshot);
      const name = entry.label ? `«${entry.label}»` : 'una versión sin nombre';
      const backupLabel = `Antes de restaurar ${name}`.slice(0, MAX_LABEL);
      // Los CTA salen de los bloques que se van a tener, no de los de ahora.
      const desired = desiredCtas(funnel, readBlocks(snapshot.content ?? funnel.content));

      const restored = await funnels.restore(funnel.id, userId, backupLabel, snapshot, desired);
      await audit.record({
        action: 'funnel.history_restore',
        resourceType: 'funnel',
        resourceId: funnel.id,
        workspaceId: funnel.workspaceId,
        userId,
        ip: ctx.ip,
        metadata: { historyId: entry.id },
      });
      return withNumberPrice(restored);
    },
  };
}

export type FunnelHistoryService = ReturnType<typeof createFunnelHistoryService>;
