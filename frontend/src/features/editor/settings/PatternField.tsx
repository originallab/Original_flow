import { ImagePlus, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiError } from '@/services/api';
import { assetProblem, uploadAsset } from '@/services/assets';
import type { DesignSpec } from '@/shared/blocks/types';
import { PATTERN_DIMS, PATTERN_MODES, PATTERN_SCALES } from '@/shared/design';
import { Button } from '@/shared/ui/Button';
import { SelectField } from '@/shared/ui/SelectField';

type Pattern = NonNullable<DesignSpec['pattern']>;

interface Props {
  token: string;
  workspaceId: string;
  pattern: Pattern | undefined;
  disabled: boolean;
  onChange: (pattern: Pattern | undefined) => void;
}

const MODE_LABELS: Record<(typeof PATTERN_MODES)[number], string> = { tile: 'Mosaico (se repite)', cover: 'Cubrir toda la página' };
const SCALE_LABELS: Record<(typeof PATTERN_SCALES)[number], string> = { sm: 'Chico', md: 'Mediano', lg: 'Grande' };
const DIM_LABELS: Record<(typeof PATTERN_DIMS)[number], string> = { 0: 'Sin atenuar', 25: 'Suave', 50: 'Media', 75: 'Fuerte' };

/** El patrón de fondo de la página: una imagen propia (PNG, JPG o WebP) que se repite o cubre la página, con la intensidad que se quiera. */
export function PatternField({ token, workspaceId, pattern, disabled, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    const problem = assetProblem(file);
    if (problem) return setMessage(problem);
    setMessage(null);
    setBusy(true);
    try {
      const asset = await uploadAsset(token, workspaceId, file);
      onChange({ assetId: asset.id, url: asset.url, mode: 'tile', scale: 'md', dim: 0 });
    } catch (err) {
      setMessage(err instanceof ApiError && err.code === 'MEDIA_NOT_CONFIGURED' ? 'La subida de imágenes todavía no está disponible.' : err instanceof ApiError ? err.message : 'No se pudo subir la imagen. Intenta de nuevo.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3" role="group" aria-label="Patrón de fondo">
      <p className="text-sm font-medium">Patrón de fondo</p>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Subir patrón de fondo" onChange={(e) => void upload(e.target.files?.[0])} />
      {pattern ? (
        <>
          <div className="flex items-center gap-3">
            {pattern.url && <img src={pattern.url} alt="Patrón actual" className="size-14 rounded border border-border object-cover" />}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={disabled || busy} onClick={() => input.current?.click()}>
                {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                Cambiar
              </Button>
              <Button type="button" variant="secondary" disabled={disabled || busy} onClick={() => onChange(undefined)}>
                Quitar
              </Button>
            </div>
          </div>
          <SelectField label="Cómo se acomoda" disabled={disabled} value={pattern.mode} onChange={(e) => onChange({ ...pattern, mode: e.target.value as Pattern['mode'] })}>
            {PATTERN_MODES.map((value) => (
              <option key={value} value={value}>
                {MODE_LABELS[value]}
              </option>
            ))}
          </SelectField>
          {pattern.mode === 'tile' && (
            <SelectField label="Tamaño del mosaico" disabled={disabled} value={pattern.scale} onChange={(e) => onChange({ ...pattern, scale: e.target.value as Pattern['scale'] })}>
              {PATTERN_SCALES.map((value) => (
                <option key={value} value={value}>
                  {SCALE_LABELS[value]}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField label="Atenuar con el color de fondo" disabled={disabled} value={String(pattern.dim)} onChange={(e) => onChange({ ...pattern, dim: Number(e.target.value) as Pattern['dim'] })}>
            {PATTERN_DIMS.map((value) => (
              <option key={value} value={String(value)}>
                {DIM_LABELS[value]}
              </option>
            ))}
          </SelectField>
        </>
      ) : (
        <Button type="button" variant="secondary" disabled={disabled || busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ImagePlus size={14} aria-hidden />}
          Subir un patrón
        </Button>
      )}
      <p className="text-xs text-text-2">PNG, JPG o WebP de hasta 5 MB. Se ve detrás de todo el contenido; atenúalo si el texto se lee mal.</p>
      {message && (
        <p role="alert" className="text-xs text-red-500">
          {message}
        </p>
      )}
    </div>
  );
}
