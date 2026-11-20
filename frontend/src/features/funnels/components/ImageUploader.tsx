import { ImagePlus, Loader2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiError } from '@/services/api';
import { assetProblem, deleteAsset, uploadAsset, type Asset } from '@/services/assets';
import { Button } from '@/shared/ui/Button';

export const MAX_PAGE_IMAGES = 6;

interface Props {
  token: string;
  workspaceId: string;
  value: Asset[];
  onChange: (images: Asset[]) => void;
}

/** Las fotos que la persona quiere en su página (del producto, del lugar…): se suben al almacén y la IA las integra. Hasta 6. */
export function ImageUploader({ token, workspaceId, value, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    setMessage(null);
    setBusy(true);
    let current = value;
    try {
      for (const file of Array.from(files)) {
        if (current.length >= MAX_PAGE_IMAGES) {
          setMessage(`Máximo ${MAX_PAGE_IMAGES} imágenes.`);
          break;
        }
        const problem = assetProblem(file);
        if (problem) {
          setMessage(`${file.name}: ${problem}`);
          continue;
        }
        try {
          current = [...current, await uploadAsset(token, workspaceId, file)];
          onChange(current);
        } catch (err) {
          setMessage(err instanceof ApiError && err.code === 'MEDIA_NOT_CONFIGURED' ? 'La subida de imágenes todavía no está disponible.' : err instanceof ApiError ? err.message : 'No se pudo subir la imagen. Intenta de nuevo.');
        }
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(asset: Asset) {
    onChange(value.filter((a) => a.id !== asset.id));
    await deleteAsset(token, asset.id).catch(() => undefined);
  }

  return (
    <section aria-label="Fotos para tu página" className="mt-6 rounded-xl border border-border bg-surface p-5">
      <h3 className="font-heading text-lg font-semibold">Fotos para tu página (opcional)</h3>
      <p className="mt-1 text-sm text-text-2">Sube hasta {MAX_PAGE_IMAGES} fotos de lo que vendes (PNG, JPG o WebP, de hasta 5 MB). La IA las integra en tu página.</p>

      {value.length > 0 && (
        <ul aria-label="Fotos subidas" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {value.map((asset) => (
            <li key={asset.id} className="relative overflow-hidden rounded-lg border border-border bg-surface-2">
              <img src={asset.url} alt={asset.name} className="h-28 w-full object-cover" />
              <p className="truncate px-2 py-1 text-xs text-text-2">{asset.name}</p>
              <button type="button" aria-label={`Quitar ${asset.name}`} onClick={() => void remove(asset)} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-violet">
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="Elegir fotos" onChange={(event) => void add(event.target.files)} />
        <Button variant="secondary" size="sm" disabled={busy || value.length >= MAX_PAGE_IMAGES} onClick={() => input.current?.click()}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ImagePlus size={14} aria-hidden />}
          {busy ? 'Subiendo…' : 'Agregar fotos'}
        </Button>
      </div>
      {message && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {message}
        </p>
      )}
    </section>
  );
}
