import { Prisma, type CtaActionType, type FunnelObjective, type PrismaClient } from '../generated/prisma/client.js';

const LIST_FIELDS = {
  id: true,
  workspaceId: true,
  name: true,
  objective: true,
  status: true,
  language: true,
  slug: true,
  productName: true,
  price: true,
  currency: true,
  targetAudience: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FunnelSelect;

const FULL_FIELDS = {
  ...LIST_FIELDS,
  typeConfig: true,
  brandBrief: true,
  designSpec: true,
  content: true,
  seo: true,
  flow: true,
} satisfies Prisma.FunnelSelect;

export type FunnelListRecord = Prisma.FunnelGetPayload<{ select: typeof LIST_FIELDS }>;
export type FunnelRecord = Prisma.FunnelGetPayload<{ select: typeof FULL_FIELDS }>;

export interface NewFunnel {
  workspaceId: string;
  name: string;
  objective: FunnelObjective;
  slug: string;
  productName?: string;
  price?: number;
  currency?: string;
  targetAudience?: string;
  language?: string;
}

export interface FunnelChanges {
  name?: string;
  productName?: string | null;
  price?: number | null;
  currency?: string;
  targetAudience?: string | null;
  slug?: string;
  seo?: Prisma.InputJsonValue | null;
  language?: string;
}

/** Un CTA que debe existir porque hay un bloque `boton` o `formulario` en la página. */
export interface DesiredCta {
  blockKey: string;
  label: string;
  /** Acción con la que nace el CTA si todavía no existe. */
  actionType: CtaActionType;
  /** Acciones válidas para ese tipo de bloque; si el CTA existente tiene otra, se reinicia. */
  allowed: readonly CtaActionType[];
}

export function createFunnelModel(prisma: PrismaClient) {
  return {
    create(data: NewFunnel): Promise<FunnelRecord> {
      return prisma.funnel.create({ data, select: FULL_FIELDS });
    },

    findById(id: string): Promise<FunnelRecord | null> {
      return prisma.funnel.findUnique({ where: { id }, select: FULL_FIELDS });
    },

    async slugExists(slug: string): Promise<boolean> {
      return (await prisma.funnel.count({ where: { slug } })) > 0;
    },

    async list(
      filter: { workspaceId: string; status?: 'draft' | 'published' },
      paging: { skip: number; take: number },
    ): Promise<{ items: FunnelListRecord[]; total: number }> {
      const where: Prisma.FunnelWhereInput = { workspaceId: filter.workspaceId, ...(filter.status ? { status: filter.status } : {}) };
      const [items, total] = await Promise.all([
        prisma.funnel.findMany({ where, select: LIST_FIELDS, orderBy: { createdAt: 'desc' }, ...paging }),
        prisma.funnel.count({ where }),
      ]);
      return { items, total };
    },

    update(id: string, changes: FunnelChanges): Promise<FunnelRecord> {
      const { seo, ...rest } = changes;
      return prisma.funnel.update({
        where: { id },
        select: FULL_FIELDS,
        data: {
          ...rest,
          ...(seo === undefined ? {} : { seo: seo === null ? Prisma.DbNull : seo }),
        },
      });
    },

    setTypeConfig(id: string, typeConfig: Prisma.InputJsonValue): Promise<FunnelRecord> {
      return prisma.funnel.update({ where: { id }, data: { typeConfig }, select: FULL_FIELDS });
    },

    /**
     * Publica el funnel y guarda en el historial una copia de su estado en ese momento
     * (contenido, diseño, marca, seo y flujo), todo en una transacción.
     */
    publish(id: string, userId: string): Promise<FunnelRecord> {
      return prisma.$transaction(async (tx) => {
        const funnel = await tx.funnel.update({ where: { id }, data: { status: 'published' }, select: FULL_FIELDS });
        const snapshot = {
          content: funnel.content,
          designSpec: funnel.designSpec,
          brandBrief: funnel.brandBrief,
          seo: funnel.seo,
          flow: funnel.flow,
        } as Prisma.InputJsonValue;
        await tx.funnelHistory.create({ data: { funnelId: id, userId, label: 'Publicado', snapshot } });
        return funnel;
      });
    },

    unpublish(id: string): Promise<FunnelRecord> {
      return prisma.funnel.update({ where: { id }, data: { status: 'draft' }, select: FULL_FIELDS });
    },

    /** Lo que necesita la captura pública (leads y eventos) de un funnel publicado. */
    findPublishedForCapture(slug: string) {
      return prisma.funnel.findFirst({
        where: { slug, status: 'published' },
        select: { id: true, workspaceId: true, objective: true, typeConfig: true },
      });
    },

    /**
     * Lo que necesita para dibujarse una página publicada. Solo lo público: no incluye el
     * workspace, la marca ni `typeConfig` (que puede traer enlaces que solo ve quien se registra).
     */
    findPublishedBySlug(slug: string) {
      return prisma.funnel.findFirst({
        where: { slug, status: 'published' },
        select: {
          slug: true,
          name: true,
          objective: true,
          language: true,
          price: true,
          currency: true,
          content: true,
          designSpec: true,
          seo: true,
          ctas: { select: { blockKey: true, label: true, actionType: true, destination: true, trackingId: true }, orderBy: { blockKey: 'asc' } },
        },
      });
    },

    countOrders(funnelId: string): Promise<number> {
      return prisma.order.count({ where: { funnelId } });
    },

    async delete(id: string): Promise<void> {
      await prisma.funnel.delete({ where: { id } });
    },

    /**
     * Guarda el contenido y sincroniza los CTA en una sola transacción: crea uno por cada
     * bloque nuevo, borra los de bloques que ya no existen y actualiza el texto de los que
     * siguen. El destino y el seguimiento que la persona haya editado se conservan.
     */
    saveContent(funnelId: string, content: Prisma.InputJsonValue, desired: DesiredCta[]) {
      return prisma.$transaction(async (tx) => {
        const saved = await tx.funnel.update({ where: { id: funnelId }, data: { content }, select: { content: true, updatedAt: true } });

        const existing = await tx.cTA.findMany({ where: { funnelId } });
        const wanted = new Set(desired.map((d) => d.blockKey));
        const orphans = existing.filter((cta) => !wanted.has(cta.blockKey)).map((cta) => cta.id);
        if (orphans.length > 0) await tx.cTA.deleteMany({ where: { id: { in: orphans } } });

        const byKey = new Map(existing.map((cta) => [cta.blockKey, cta]));
        for (const d of desired) {
          const current = byKey.get(d.blockKey);
          if (!current) {
            await tx.cTA.create({ data: { funnelId, blockKey: d.blockKey, label: d.label, actionType: d.actionType } });
          } else if (!d.allowed.includes(current.actionType)) {
            await tx.cTA.update({ where: { id: current.id }, data: { label: d.label, actionType: d.actionType, destination: null } });
          } else if (current.label !== d.label) {
            await tx.cTA.update({ where: { id: current.id }, data: { label: d.label } });
          }
        }
        return saved;
      });
    },
  };
}

export type FunnelModel = ReturnType<typeof createFunnelModel>;
