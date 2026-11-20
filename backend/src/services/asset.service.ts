import type { MediaStore } from '../integrations/media-aas/types.js';
import { AppError } from '../lib/errors.js';
import type { WindowLimiter } from '../lib/windowLimiter.js';
import type { AssetModel, AssetRecord } from '../models/asset.model.js';
import type { AccessService } from './access.service.js';
import type { AuditService } from './audit.service.js';
import type { RequestContext } from './auth.service.js';
import { assertCan } from './permissions.js';

/** Solo imágenes que cualquier navegador muestra. El SVG queda fuera a propósito (puede llevar código). */
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ASSETS_PER_WORKSPACE = 100;

const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** ¿Los primeros bytes son de verdad del tipo que dice el encabezado? (no se confía en lo que declara el navegador). */
export function matchesImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  const at = (i: number) => bytes[i];
  if (mimeType === 'image/png') return bytes.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b);
  if (mimeType === 'image/jpeg') return bytes.length > 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
  if (mimeType === 'image/webp') return bytes.length > 12 && [0x52, 0x49, 0x46, 0x46].every((b, i) => at(i) === b) && [0x57, 0x45, 0x42, 0x50].every((b, i) => at(8 + i) === b);
  return false;
}

/** Un nombre seguro para mostrar: sin rutas ni caracteres raros, con la extensión del tipo real. */
export function safeFileName(raw: string | undefined, mimeType: string): string {
  const ext = EXTENSION[mimeType] ?? 'bin';
  const base = (raw ?? '').split(/[\\/]/).pop()?.replace(/\.[^.]*$/, '') ?? '';
  const cleaned = base.normalize('NFKD').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60);
  return `${cleaned || 'imagen'}.${ext}`;
}

export interface AssetDto {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

const toDto = (a: Pick<AssetRecord, 'id' | 'publicUrl' | 'name' | 'mimeType' | 'size' | 'createdAt'>): AssetDto => ({ id: a.id, url: a.publicUrl, name: a.name, mimeType: a.mimeType, size: a.size, createdAt: a.createdAt });

interface Deps {
  assets: AssetModel;
  media: MediaStore;
  access: AccessService;
  audit: AuditService;
  /** Cupo de subidas por negocio y hora. */
  limiter: WindowLimiter;
}

/**
 * Las imágenes que sube la persona (del producto, del logo...). El archivo va a Media-as-a-Service, público (se muestra
 * en las páginas); aquí queda de qué negocio es. Se valida el tipo, el tamaño y el CONTENIDO real del archivo. Un
 * archivo de otro negocio responde 404 (nunca 403). Los nombres de archivo no se escriben en la auditoría.
 */
export function createAssetService({ assets, media, access, audit, limiter }: Deps) {
  async function managed(userId: string, workspaceId: string) {
    const resolved = await access.resolve(userId, workspaceId);
    if (!resolved) throw AppError.notFound('WORKSPACE_NOT_FOUND', 'Workspace no encontrado');
    assertCan(resolved.role, 'funnel:edit');
  }

  return {
    /** POST /assets */
    async upload(userId: string, workspaceId: string, file: { bytes: Uint8Array; mimeType: string; name?: string }, ctx: RequestContext): Promise<AssetDto> {
      await managed(userId, workspaceId);
      if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimeType)) {
        throw AppError.unprocessable('ASSET_TYPE_NOT_ALLOWED', 'Solo se aceptan imágenes PNG, JPG o WebP');
      }
      if (file.bytes.length === 0) throw AppError.unprocessable('ASSET_EMPTY', 'El archivo está vacío');
      if (file.bytes.length > MAX_IMAGE_BYTES) throw AppError.unprocessable('ASSET_TOO_LARGE', 'La imagen pesa más de 5 MB');
      if (!matchesImageSignature(file.bytes, file.mimeType)) throw AppError.unprocessable('ASSET_INVALID', 'El archivo no es una imagen válida');
      if ((await assets.count(workspaceId)) >= MAX_ASSETS_PER_WORKSPACE) {
        throw AppError.unprocessable('ASSET_LIMIT_REACHED', 'Se alcanzó el máximo de imágenes de este negocio; elimina alguna');
      }
      if (!limiter.take(workspaceId)) throw AppError.tooManyRequests('ASSET_RATE_LIMITED', 'Demasiadas subidas; intenta más tarde');

      const name = safeFileName(file.name, file.mimeType);
      const stored = await media.upload({ requestId: ctx.requestId, workspaceId }, { bytes: file.bytes, fileName: name, mimeType: file.mimeType, isPublic: true });
      if (!stored.publicUrl) {
        await media.remove({ requestId: ctx.requestId, workspaceId }, stored.fileId).catch(() => undefined);
        throw AppError.serviceUnavailable('MEDIA_BAD_RESPONSE', 'El almacén de archivos no devolvió una dirección pública');
      }
      let created;
      try {
        created = await assets.create({ workspaceId, mediaFileId: stored.fileId, s3Key: stored.s3Key, publicUrl: stored.publicUrl, name, mimeType: file.mimeType, size: file.bytes.length, createdBy: userId });
      } catch (err) {
        // Si no se pudo guardar el registro, no se deja un archivo huérfano en el almacén.
        await media.remove({ requestId: ctx.requestId, workspaceId }, stored.fileId).catch(() => undefined);
        throw err;
      }
      await audit.record({ action: 'asset.upload', resourceType: 'asset', resourceId: created.id, workspaceId, userId, ip: ctx.ip, metadata: { size: file.bytes.length, mimeType: file.mimeType } });
      return toDto(created);
    },

    /** GET /assets?workspaceId= */
    async list(userId: string, workspaceId: string): Promise<AssetDto[]> {
      await managed(userId, workspaceId);
      return (await assets.list(workspaceId)).map(toDto);
    },

    /** DELETE /assets/:id: borra el archivo del almacén y el registro. */
    async remove(userId: string, assetId: string, ctx: RequestContext): Promise<void> {
      const asset = await assets.findById(assetId);
      const resolved = asset ? await access.resolve(userId, asset.workspaceId) : null;
      if (!asset || !resolved) throw AppError.notFound('ASSET_NOT_FOUND', 'Imagen no encontrada');
      assertCan(resolved.role, 'funnel:edit');
      try {
        await media.remove({ requestId: ctx.requestId, workspaceId: asset.workspaceId }, asset.mediaFileId);
      } catch (err) {
        // Si el almacén ya no la tiene, el registro igual se borra; cualquier otro fallo se muestra.
        if (!(err instanceof AppError && err.code === 'MEDIA_NOT_FOUND')) throw err;
      }
      await assets.delete(asset.id);
      await audit.record({ action: 'asset.delete', resourceType: 'asset', resourceId: asset.id, workspaceId: asset.workspaceId, userId, ip: ctx.ip });
    },
  };
}

export type AssetService = ReturnType<typeof createAssetService>;
