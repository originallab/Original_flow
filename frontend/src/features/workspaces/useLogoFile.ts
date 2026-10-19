import { useCallback, useEffect, useRef, useState } from 'react';

export interface LogoFile {
  name: string;
  size: number;
  /** Dirección temporal (`blob:`) para mostrar la imagen en esta pantalla. */
  url: string;
}

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;

/** `null` si la imagen sirve; si no, el motivo en español. */
export function validateLogo(file: { type: string; size: number }): string | null {
  if (!LOGO_TYPES.includes(file.type)) return 'Usa una imagen PNG, JPG, WebP o SVG.';
  if (file.size > LOGO_MAX_BYTES) return 'La imagen pesa más de 5 MB. Usa una más ligera.';
  return null;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * La imagen que la persona eligió para su marca. Solo vive en esta pantalla (en el navegador): todavía
 * no se sube a ningún servidor. Libera la dirección temporal al cambiar de imagen y al salir.
 */
export function useLogoFile() {
  const [logo, setLogo] = useState<LogoFile | null>(null);
  const currentUrl = useRef<string | null>(null);

  const release = useCallback(() => {
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = null;
  }, []);

  useEffect(() => release, [release]);

  /** Devuelve el motivo si la imagen no sirve; `null` si quedó elegida. */
  const choose = useCallback(
    (file: File): string | null => {
      const problem = validateLogo(file);
      if (problem) return problem;
      release();
      currentUrl.current = URL.createObjectURL(file);
      setLogo({ name: file.name, size: file.size, url: currentUrl.current });
      return null;
    },
    [release],
  );

  const clear = useCallback(() => {
    release();
    setLogo(null);
  }, [release]);

  return { logo, choose, clear };
}
