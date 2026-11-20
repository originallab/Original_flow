import { Copy, Power, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '@/services/api';
import { deleteFunnel, duplicateFunnel, publishFunnel, unpublishFunnel, type FunnelSummary } from '@/services/funnels';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { canDeleteFunnels, canEditFunnels, canPublishFunnels } from '@/shared/utils/permissions';

interface Props {
  funnel: FunnelSummary;
  token: string;
  role: string | undefined;
  /** Algo cambió (copia, estado o eliminación): hay que volver a cargar la lista. */
  onChanged: () => void;
  /** Un aviso para quien está en la lista (`null` lo quita). */
  onNotice: (message: string | null) => void;
}

/** Lo que se puede hacer con un funnel desde la lista: copiarlo, activarlo o desactivarlo (publicar/despublicar) y eliminarlo, según el rol. */
export function FunnelRowActions({ funnel, token, role, onChanged, onNotice }: Props) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const active = funnel.status === 'published';

  async function run(action: () => Promise<unknown>, onError?: (err: ApiError) => string | undefined) {
    if (busy) return;
    setBusy(true);
    onNotice(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      const message = err instanceof ApiError ? (onError?.(err) ?? err.message) : 'No se pudo completar la acción. Intenta de nuevo.';
      onNotice(message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const toggle = () =>
    run(
      () => (active ? unpublishFunnel(token, funnel.id) : publishFunnel(token, funnel.id)),
      (err) => (err.status === 422 ? `«${funnel.name}» todavía no se puede activar: ábrelo y revisa la lista de requisitos en Publicar.` : undefined),
    );
  const remove = () => run(() => deleteFunnel(token, funnel.id), (err) => (err.code === 'FUNNEL_HAS_ORDERS' ? `«${funnel.name}» ya tiene ventas y no se puede eliminar; desactívalo en su lugar.` : undefined));

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {canEditFunnels(role) && (
        <Button size="sm" variant="secondary" disabled={busy} aria-label={`Copiar ${funnel.name}`} title="Copiar" onClick={() => void run(() => duplicateFunnel(token, funnel.id))}>
          <Copy size={14} aria-hidden />
        </Button>
      )}
      {canPublishFunnels(role) && (
        <Button size="sm" variant="secondary" disabled={busy} aria-label={`${active ? 'Desactivar' : 'Activar'} ${funnel.name}`} title={active ? 'Desactivar (vuelve a borrador)' : 'Activar (publicar)'} onClick={() => void toggle()}>
          <Power size={14} aria-hidden />
          <span className="hidden sm:inline">{active ? 'Desactivar' : 'Activar'}</span>
        </Button>
      )}
      {canDeleteFunnels(role) && (
        <Button size="sm" variant="secondary" disabled={busy} aria-label={`Eliminar ${funnel.name}`} title="Eliminar" onClick={() => setConfirming(true)}>
          <Trash2 size={14} aria-hidden />
        </Button>
      )}

      {confirming && (
        <Modal title="Eliminar funnel" onClose={() => setConfirming(false)} locked={busy}>
          <p className="mt-4 text-sm text-text-2">
            ¿Eliminar «{funnel.name}»? Se borran su página, sus leads y su historial. No se puede deshacer.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void remove()}>
              {busy ? 'Eliminando…' : 'Sí, eliminar'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
