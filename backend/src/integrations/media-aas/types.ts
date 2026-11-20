/** Lo que Original Flow necesita de Media-as-a-Service (guardar y borrar imágenes). La implementación real habla con MediaAAS; otra responde «no disponible» sin credenciales. */
export interface MediaUploadInput {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  /** Las imágenes de las páginas y los logos son públicas (accesibles sin firma); lo demás, privado. */
  isPublic: boolean;
}

export interface StoredMedia {
  /** El id del archivo en MediaAAS (para borrarlo). */
  fileId: number;
  s3Key: string;
  /** Dirección estable, sin firma, solo si el archivo es público. */
  publicUrl: string | null;
}

export interface MediaContext {
  requestId: string;
  workspaceId?: string;
}

export interface MediaStore {
  upload(ctx: MediaContext, input: MediaUploadInput): Promise<StoredMedia>;
  remove(ctx: MediaContext, fileId: number): Promise<void>;
}
