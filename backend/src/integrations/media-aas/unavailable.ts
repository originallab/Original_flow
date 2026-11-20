import { AppError } from '../../lib/errors.js';
import type { MediaStore } from './types.js';

/** El almacén de archivos mientras no haya credenciales de MediaAAS: todo responde 503 `MEDIA_NOT_CONFIGURED` y no toca nada. */
export function createUnavailableMediaStore(): MediaStore {
  const unavailable = (): never => {
    throw AppError.serviceUnavailable('MEDIA_NOT_CONFIGURED', 'La subida de imágenes todavía no está disponible');
  };
  return { upload: async () => unavailable(), remove: async () => unavailable() };
}
