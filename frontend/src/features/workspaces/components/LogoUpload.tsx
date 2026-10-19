import { ImagePlus, Sparkles } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/shared/ui/Button';
import { formatBytes, LOGO_TYPES, type LogoFile } from '../useLogoFile';

interface Props {
  logo: LogoFile | null;
  /** Intenta elegir la imagen; devuelve el motivo si no sirve. */
  onChoose: (file: File) => string | null;
  onClear: () => void;
  /** Pide a la IA una paleta a partir de la imagen. */
  onSuggest: () => void;
  /** Ya se mostró una sugerencia (para explicar de dónde salió). */
  suggested: boolean;
}

/**
 * Sube una imagen de la marca (por ejemplo el logo) y ofrece pedirle a la IA una paleta a partir de ella.
 * CÁSCARA: la imagen solo se muestra aquí y la sugerencia es un ejemplo fijo; el almacenamiento de
 * archivos (Media-as-a-Service) y Original AI Engine se conectan más adelante.
 */
export function LogoUpload({ logo, onChoose, onClear, onSuggest, suggested }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite volver a elegir el mismo archivo
    if (file) setError(onChoose(file));
  }

  return (
    <section aria-labelledby="logo-titulo">
      <h2 id="logo-titulo" className="text-sm font-medium">
        Tu logo o una imagen de tu marca
      </h2>
      <p className="mt-1 text-sm text-text-2">Súbela y la IA te propondrá una paleta de colores. También puedes elegirlos a mano más abajo.</p>

      <input ref={input} type="file" accept={LOGO_TYPES.join(',')} aria-label="Archivo de imagen" tabIndex={-1} onChange={onFile} className="sr-only" />

      {logo ? (
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface-2 p-4">
          <img src={logo.url} alt="Vista previa de tu imagen" className="size-16 rounded-lg border border-border bg-surface object-contain p-1" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{logo.name}</p>
            <p className="text-xs text-muted">{formatBytes(logo.size)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
              Cambiar
            </Button>
            <Button variant="ghost" size="sm" onClick={onClear}>
              Quitar
            </Button>
            <Button size="sm" onClick={onSuggest}>
              <Sparkles size={14} aria-hidden /> Sugerir paleta con IA
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="mt-3 flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center transition hover:border-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
        >
          <ImagePlus size={22} className="text-violet-tint-text" aria-hidden />
          <span className="text-sm font-medium">Subir imagen</span>
          <span className="text-xs text-muted">PNG, JPG, WebP o SVG · hasta 5 MB</span>
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      )}
      {logo && (
        <p className="mt-2 text-xs text-muted">Por ahora la imagen solo se usa en esta pantalla; se guardará cuando se conecte el almacenamiento de archivos.</p>
      )}
      {suggested && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-violet-tint-border bg-violet-tint px-3 py-2 text-sm text-violet-tint-text">
          <Sparkles size={16} className="mt-0.5 shrink-0" aria-hidden />
          Sugerencia de ejemplo: así se verá la propuesta de la IA. Todavía no analiza tu imagen (se conectará con Original AI Engine). Puedes ajustar cualquier color.
        </p>
      )}
    </section>
  );
}
