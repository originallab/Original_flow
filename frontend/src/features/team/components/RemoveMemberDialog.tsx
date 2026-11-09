import { useState } from 'react';
import type { Member } from '@/services/members';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';

interface Props {
  member: Member;
  workspaceName: string;
  onClose: () => void;
  /** Quita a la persona; devuelve el mensaje de error o `null` si se quitó. */
  onConfirm: (memberId: string) => Promise<string | null>;
}

/** Pide confirmar antes de quitar a alguien, y avisa qué acceso pierde. */
export function RemoveMemberDialog({ member, workspaceName, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = member.name ?? member.email ?? 'esta persona';

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const problem = await onConfirm(member.id);
    setBusy(false);
    if (problem) setError(problem);
    else onClose();
  }

  return (
    <Modal title="Quitar del equipo" onClose={onClose} locked={busy}>
      <p className="text-sm text-text-2">
        {member.role === 'client_admin' ? (
          <>
            ¿Quitar a <strong className="text-text">{who}</strong>? Como es administrador, perderá el acceso a <strong className="text-text">todos los negocios</strong> de este cliente.
          </>
        ) : (
          <>
            ¿Quitar a <strong className="text-text">{who}</strong> del equipo de <strong className="text-text">{workspaceName}</strong>? Perderá el acceso a este negocio.
          </>
        )}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button className="bg-red-600 text-white hover:bg-red-700" onClick={confirm} disabled={busy}>
          {busy ? 'Quitando…' : 'Quitar'}
        </Button>
      </div>
    </Modal>
  );
}
