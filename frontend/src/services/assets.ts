import { apiFetch } from './api';
import { isDemoMode } from './demo';

/** Una imagen que la persona subió (del producto, del logo…): su dirección pública sirve para mostrarla. */
export interface Asset {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export const ASSET_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/** Lo que el navegador puede comprobar antes de subir; el servidor lo vuelve a validar. Devuelve el problema, o `null` si está bien. */
export function assetProblem(file: { type: string; size: number }): string | null {
  if (!(ASSET_TYPES as readonly string[]).includes(file.type)) return 'Solo se aceptan imágenes PNG, JPG o WebP.';
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_ASSET_BYTES) return 'La imagen pesa más de 5 MB.';
  return null;
}

/**
 * POST /assets: sube la imagen como binario directo (con su tipo) y el nombre en `X-File-Name`. En el modo demostración
 * (sin servidor) no sube nada: la imagen se muestra desde el propio navegador.
 */
export async function uploadAsset(token: string, workspaceId: string, file: File): Promise<Asset> {
  if (import.meta.env.DEV && isDemoMode()) {
    return { id: crypto.randomUUID(), url: URL.createObjectURL(file), name: file.name, mimeType: file.type, size: file.size, createdAt: new Date().toISOString() };
  }
  return apiFetch(`/assets?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'POST', body: file, token, headers: { 'X-File-Name': encodeURIComponent(file.name) } });
}

/** DELETE /assets/:id */
export async function deleteAsset(token: string, id: string): Promise<void> {
  if (import.meta.env.DEV && isDemoMode()) return;
  await apiFetch(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE', token });
}
