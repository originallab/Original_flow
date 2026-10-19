import { useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { BrandPreview } from '@/features/workspaces/components/BrandPreview';
import { BusinessForm } from '@/features/workspaces/components/BusinessForm';
import { PaletteEditor } from '@/features/workspaces/components/PaletteEditor';
import { diffWorkspace, SUGGESTED_PALETTE, valuesOf, type BusinessValues } from '@/features/workspaces/brand';
import { useWorkspaces } from '@/features/workspaces/WorkspaceProvider';
import { ApiError } from '@/services/api';
import { updateWorkspace, type BrandPalette, type Workspace } from '@/services/workspaces';
import { canManageWorkspace } from '@/shared/utils/permissions';

/** Datos y marca del negocio activo. Solo quien administra el negocio los puede editar. */
export function BusinessPage() {
  const { token } = useAuth();
  const { active, upsert } = useWorkspaces();
  if (!active) return null;
  // `key` reinicia el formulario al cambiar de negocio.
  return <BusinessEditor key={active.id} workspace={active} token={token} onSaved={(w) => upsert(w)} />;
}

function BusinessEditor({ workspace, token, onSaved }: { workspace: Workspace; token: string | null; onSaved: (w: Workspace) => void }) {
  const canEdit = canManageWorkspace(workspace.role);
  const [palette, setPalette] = useState<BrandPalette>(workspace.brandPalette ?? SUGGESTED_PALETTE);
  const [saved, setSaved] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);

  // La paleta sugerida solo se guarda si la persona la toca: el negocio sin paleta se compara contra `null`.
  const paletteToSave = workspace.brandPalette === null && palette === SUGGESTED_PALETTE ? null : palette;

  async function save(values: BusinessValues) {
    if (!token) return;
    setSaved(false);
    setBrandError(null);
    const changes = diffWorkspace(workspace, values, paletteToSave);
    if (Object.keys(changes).length === 0) {
      setSaved(true);
      return;
    }
    try {
      onSaved(await updateWorkspace(token, workspace.id, changes));
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && Object.keys(err.fieldErrors()).some((p) => p.startsWith('brandPalette'))) {
        setBrandError('Alguno de los colores no es válido.');
      }
      throw err;
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="font-heading text-3xl font-semibold">Mi negocio</h1>
      <p className="mt-2 text-text-2">Los datos y la marca de {workspace.name}.</p>
      {!canEdit && (
        <p role="status" className="mt-4 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text-2">
          Solo el administrador del negocio puede editar estos datos.
        </p>
      )}

      <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-heading text-lg font-semibold">Datos</h2>
        <div className="mt-4">
          <BusinessForm initial={valuesOf(workspace)} submitLabel="Guardar cambios" onSubmit={save} readOnly={!canEdit}>
            <div className="border-t border-border pt-5">
              <h2 className="font-heading text-lg font-semibold">Marca</h2>
              <p className="mt-1 mb-4 text-sm text-text-2">Se usa en tus landing pages publicadas.</p>
              <PaletteEditor
                value={palette}
                onChange={(next) => {
                  setSaved(false);
                  setPalette(next);
                }}
                disabled={!canEdit}
              />
              <div className="mt-6">
                <BrandPreview palette={palette} name={workspace.name} />
              </div>
              {brandError && (
                <p role="alert" className="mt-4 text-sm text-red-500">
                  {brandError}
                </p>
              )}
            </div>
          </BusinessForm>
        </div>
      </section>

      {saved && (
        <p role="status" className="mt-4 text-sm text-violet-tint-text">
          Cambios guardados.
        </p>
      )}
    </div>
  );
}
