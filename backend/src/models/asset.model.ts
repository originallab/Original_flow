import type { PrismaClient } from '../generated/prisma/client.js';

export interface NewAsset {
  workspaceId: string;
  mediaFileId: number;
  s3Key: string;
  publicUrl: string;
  name: string;
  mimeType: string;
  size: number;
  createdBy?: string;
}

const FIELDS = { id: true, workspaceId: true, mediaFileId: true, publicUrl: true, name: true, mimeType: true, size: true, createdAt: true } as const;

/** Acceso a datos de `Asset` (las imágenes que sube la persona). */
export function createAssetModel(prisma: PrismaClient) {
  return {
    create(asset: NewAsset) {
      return prisma.asset.create({ data: asset, select: FIELDS });
    },

    findById(id: string) {
      return prisma.asset.findUnique({ where: { id }, select: FIELDS });
    },

    list(workspaceId: string) {
      return prisma.asset.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, select: FIELDS });
    },

    /** Las imágenes con esos ids que SÍ son de ese negocio (las de otro negocio no salen). */
    findOwned(workspaceId: string, ids: string[]) {
      return prisma.asset.findMany({ where: { workspaceId, id: { in: ids } }, select: FIELDS });
    },

    count(workspaceId: string): Promise<number> {
      return prisma.asset.count({ where: { workspaceId } });
    },

    async delete(id: string): Promise<void> {
      await prisma.asset.delete({ where: { id } });
    },
  };
}

export type AssetModel = ReturnType<typeof createAssetModel>;
export type AssetRecord = NonNullable<Awaited<ReturnType<AssetModel['findById']>>>;
