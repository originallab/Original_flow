import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiError } from '@/services/api';
import { assetProblem, uploadAsset } from '@/services/assets';
import { updateWorkspace, type Workspace } from '@/services/workspaces';
import { Button } from '@/shared/ui/Button';

interface Props {
  workspace: Workspace;
  token: string | null;
  /** Solo quien administra el negocio puede cambiar el logo. */
  canEdit: boolean;
  onSaved: (workspace: Workspace) => void;
}

/** El logo del negocio: se ve, se sube (PNG, JPG o WebP, hasta 5 MB), se cambia y se quita. Se usa en las páginas que genera la IA. */
export function LogoSection({ workspace, token, canEdit, onSaved }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function change(logoFileId: string | null, file?: File) {
    if (!token || busy) return;
    setMessage(null);
    setBusy(true);
    try {
      const id = file ? (await uploadAsset(token, workspace.id, file)).id : logoFileId;
      onSaved(await updateWorkspace(token, workspace.id, { logoFileId: id }));
    } catch (err) {
      setMessage(err instanceof ApiError && err.code === 'MEDIA_NOT_CONFIGURED' ? 'La subida de imágenes todavía no está disponible.' : err instanceof ApiError ? err.message : 'No se pudo guardar el logo. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  function onFile(files: FileList | null) {
    const file = files?.[0];
    if (input.current) input.current.value = '';
    if (!file) return;
    const problem = assetProblem(file);
    if (problem) return setMessage(problem);
    void change(null, file);
  }

  return (
    <section aria-label="Logo" className="mt-8 rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-heading text-lg font-semibold">Logo</h2>
      <p className="mt-1 text-sm text-text-2">Aparece en las páginas que genera la IA. PNG, JPG o WebP, de hasta 5 MB.</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="grid size-24 place-items-center overflow-hidden rounded-xl border border-border bg-surface-2">
          {workspace.logoUrl ? <img src={workspace.logoUrl} alt={`Logo de ${workspace.name}`} className="max-h-full max-w-full object-contain" /> : <span className="px-2 text-center text-xs text-muted">Sin logo</span>}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Archivo de logo" onChange={(event) => onFile(event.target.files)} />
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ImagePlus size={14} aria-hidden />}
              {busy ? 'Guardando…' : workspace.logoUrl ? 'Cambiar logo' : 'Subir logo'}
            </Button>
            {workspace.logoFileId && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void change(null)}>
                <Trash2 size={14} aria-hidden /> Quitar logo
              </Button>
            )}
          </div>
        )}
      </div>
      {message && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {message}
        </p>
      )}
    </section>
  );
}
