import { randomUUID } from 'node:crypto';
import type { MembershipRole } from '../generated/prisma/client.js';
import { getFunnelType } from '../funnel-types/index.js';
import { AppError } from '../lib/errors.js';
import { pageToSkipTake, toPage, type Page } from '../lib/pagination.js';
import { isUniqueViolation } from '../lib/prismaErrors.js';
import { randomSuffix, slugify } from '../lib/slug.js';
import type { FunnelListRecord, FunnelModel, FunnelRecord } from '../models/funnel.model.js';
import type { CreateFunnelBody, ListFunnelsQuery, UpdateFunnelBody } from '../schemas/funnel.schemas.js';
import type { AccessService } from './access.service.js';
import type { AuditService } from './audit.service.js';
import type { RequestContext } from './auth.service.js';
import { assertCan, type Action } from './permissions.js';

/** El precio sale como número (Prisma lo maneja como Decimal, que en JSON sería un texto). */
type WithNumberPrice<T extends { price: unknown }> = Omit<T, 'price'> & { price: number | null };

export type FunnelListDto = WithNumberPrice<FunnelListRecord>;
export type FunnelDto = WithNumberPrice<FunnelRecord>;

export function withNumberPrice<T extends { price: { toNumber(): number } | null }>(record: T): WithNumberPrice<T> {
  return { ...record, price: record.price ? record.price.toNumber() : null };
}

interface Deps {
  funnels: FunnelModel;
  access: AccessService;
  audit: AuditService;
}

export function createFunnelService({ funnels, access, audit }: Deps) {
  /**
   * Carga un funnel verificando acceso y permiso. Si no existe o su workspace no es de la
   * persona responde 404 (nunca 403); si lo ve pero su rol no puede, 403.
   */
  async function load(userId: string, funnelId: string, action: Action): Promise<{ funnel: FunnelRecord; role: MembershipRole }> {
    const funnel = await funnels.findById(funnelId);
    const resolved = funnel ? await access.resolve(userId, funnel.workspaceId) : null;
    if (!funnel || !resolved) throw AppError.notFound('FUNNEL_NOT_FOUND', 'Funnel no encontrado');
    assertCan(resolved.role, action);
    return { funnel, role: resolved.role };
  }

  /** Slug a partir del nombre; si ya existe, se le agrega un sufijo corto. */
  async function freeSlug(name: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!(await funnels.slugExists(candidate))) return candidate;
      candidate = `${base}-${randomSuffix()}`;
    }
    return `${base}-${randomUUID().slice(0, 8)}`;
  }

  return {
    load,

    /** GET /funnels?workspaceId=&status= */
    async list(userId: string, query: ListFunnelsQuery): Promise<Page<FunnelListDto>> {
      const resolved = await access.resolve(userId, query.workspaceId);
      if (!resolved) throw AppError.notFound('WORKSPACE_NOT_FOUND', 'Workspace no encontrado');
      assertCan(resolved.role, 'funnel:list');
      const { items, total } = await funnels.list({ workspaceId: query.workspaceId, status: query.status }, pageToSkipTake(query));
      return toPage(items.map(withNumberPrice), total, query);
    },

    /** POST /funnels: crea un funnel en borrador con los datos del wizard. */
    async create(userId: string, body: CreateFunnelBody, ctx: RequestContext): Promise<FunnelDto> {
      const resolved = await access.resolve(userId, body.workspaceId);
      if (!resolved) throw AppError.notFound('WORKSPACE_NOT_FOUND', 'Workspace no encontrado');
      assertCan(resolved.role, 'funnel:edit');

      if (!getFunnelType(body.objective).available) {
        throw AppError.unprocessable('FUNNEL_TYPE_UNAVAILABLE', 'Ese tipo de funnel todavía no está disponible');
      }

      let created: FunnelRecord | null = null;
      for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
        try {
          created = await funnels.create({ ...body, slug: attempt === 0 ? await freeSlug(body.name) : `${slugify(body.name)}-${randomUUID().slice(0, 8)}` });
        } catch (err) {
          // Otro funnel tomó ese slug justo ahora: se reintenta con otro.
          if (!isUniqueViolation(err)) throw err;
        }
      }
      if (!created) throw AppError.conflict('SLUG_TAKEN', 'No se pudo generar un slug disponible; intenta de nuevo');

      await audit.record({
        action: 'funnel.create',
        resourceType: 'funnel',
        resourceId: created.id,
        workspaceId: created.workspaceId,
        userId,
        ip: ctx.ip,
        metadata: { objective: created.objective },
      });
      return withNumberPrice(created);
    },

    /** GET /funnels/:id: el funnel completo para cargar el editor. */
    async get(userId: string, funnelId: string): Promise<FunnelDto> {
      const { funnel } = await load(userId, funnelId, 'funnel:edit');
      return withNumberPrice(funnel);
    },

    /** PATCH /funnels/:id */
    async update(userId: string, funnelId: string, body: UpdateFunnelBody, ctx: RequestContext): Promise<FunnelDto> {
      const { funnel } = await load(userId, funnelId, 'funnel:edit');
      let updated: FunnelRecord;
      try {
        updated = await funnels.update(funnel.id, body);
      } catch (err) {
        if (isUniqueViolation(err)) throw AppError.conflict('SLUG_TAKEN', 'Ese slug ya lo usa otro funnel');
        throw err;
      }
      await audit.record({
        action: 'funnel.update',
        resourceType: 'funnel',
        resourceId: funnel.id,
        workspaceId: funnel.workspaceId,
        userId,
        ip: ctx.ip,
        metadata: { fields: Object.keys(body) },
      });
      return withNumberPrice(updated);
    },

    /**
     * DELETE /funnels/:id: borra el funnel y, en cascada, sus CTA, historial, leads y eventos.
     * Un funnel con órdenes no se borra (se conserva el registro del cobro): hay que despublicarlo.
     */
    async remove(userId: string, funnelId: string, ctx: RequestContext): Promise<void> {
      const { funnel } = await load(userId, funnelId, 'funnel:delete');
      if ((await funnels.countOrders(funnel.id)) > 0) {
        throw AppError.conflict('FUNNEL_HAS_ORDERS', 'Un funnel con órdenes no se puede eliminar; despublícalo en su lugar');
      }
      await funnels.delete(funnel.id);
      await audit.record({
        action: 'funnel.delete',
        resourceType: 'funnel',
        resourceId: funnel.id,
        workspaceId: funnel.workspaceId,
        userId,
        ip: ctx.ip,
      });
    },
  };
}

export type FunnelService = ReturnType<typeof createFunnelService>;
