import { useState, type FormEvent } from 'react';
import type { Funnel } from '@/services/funnels';
import type { HistoryEntry } from '@/services/history';
import { labelProblem, MAX_LABEL } from '@/shared/history';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { TextField } from '@/shared/ui/TextField';
import { fullDate, relativeDate } from '@/shared/utils/dates';
import { useHistory } from '../useHistory';

interface Props {
  funnelId: string;
  token: string;
  /** Puede devolver la página a una versión (el diseñador guarda versiones, pero no restaura). */
  canRestore: boolean;
  /** Guarda lo que esté pendiente en el editor; `false` si no se pudo (campos con errores o sin conexión). */
  saveNow: () => Promise<boolean>;
  /** El funnel ya restaurado: el editor cambia lo que muestra por él. */
  onRestored: (funnel: Funnel) => void;
  onClose: () => void;
}

const NEED_VALID = 'Corrige los campos marcados de la página';

/** Las versiones guardadas de la página: guardar una con nombre y volver a cualquiera (lo de ahora se guarda antes, para poder deshacer). */
export function HistoryDialog({ funnelId, token, canRestore, saveNow, onRestored, onClose }: Props) {
  const history = useHistory(token, funnelId);
  const [label, setLabel] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [busy, setBusy] = useState<'saving' | 'restoring' | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setNotice(null);
    setProblem(null);
    const invalid = labelProblem(label);
    if (invalid) return setFieldError(invalid);
    setFieldError(undefined);
    setBusy('saving');
    // Lo último que escribió quien edita debe quedar dentro de la versión.
    if (!(await saveNow())) {
      setBusy(null);
      return setProblem(`${NEED_VALID} para poder guardar una versión.`);
    }
    const result = await history.save(label.trim());
    setBusy(null);
    if (result.ok) {
      setLabel('');
      setNotice('Versión guardada.');
    } else setProblem(result.message);
  }

  async function restore(entry: HistoryEntry) {
    if (busy) return;
    setNotice(null);
    setProblem(null);
    setBusy('restoring');
    if (!(await saveNow())) {
      setBusy(null);
      return setProblem(`${NEED_VALID} antes de restaurar: lo que tienes ahora se guarda para poder deshacer.`);
    }
    const result = await history.restore(entry.id);
    setBusy(null);
    setConfirming(null);
    if (result.ok) {
      onRestored(result.funnel);
      setNotice('Versión restaurada. Lo que tenías antes quedó guardado en el historial.');
    } else setProblem(result.message);
  }

  return (
    <Modal title="Historial de versiones" onClose={onClose} locked={busy !== null}>
      <p className="text-sm text-text-2">Guarda cómo está tu página ahora para volver a ella cuando quieras. Cada vez que publicas también se guarda una versión.</p>

      <form onSubmit={submit} noValidate aria-label="Guardar una versión" className="mt-4 flex items-start gap-2">
        <div className="flex-1">
          <TextField
            label="Nombre de la versión"
            placeholder="Antes de cambiar el precio"
            value={label}
            error={fieldError}
            hint={fieldError ? undefined : `Hasta ${MAX_LABEL} caracteres.`}
            onChange={(event) => {
              setLabel(event.target.value);
              setFieldError(undefined);
              setNotice(null);
            }}
          />
        </div>
        <Button type="submit" size="sm" className="mt-7" disabled={busy !== null}>
          {busy === 'saving' ? 'Guardando…' : 'Guardar versión'}
        </Button>
      </form>

      {problem && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {problem}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-violet-tint-text">
          {notice}
        </p>
      )}

      <h3 className="mt-6 font-heading text-base font-semibold">Versiones</h3>
      {history.load === 'loading' && (
        <p role="status" className="mt-2 text-sm text-text-2">
          Cargando las versiones…
        </p>
      )}
      {history.load === 'error' && (
        <div className="mt-2">
          <p role="alert" className="text-sm">
            No se pudo cargar el historial.
          </p>
          <Button className="mt-3" size="sm" onClick={history.retry}>
            Reintentar
          </Button>
        </div>
      )}
      {history.load === 'ready' && history.entries.length === 0 && <p className="mt-2 text-sm text-text-2">Todavía no hay versiones. Se guarda una cada vez que publicas o cuando tú lo pidas.</p>}
      {history.load === 'ready' && history.entries.length > 0 && (
        <ul aria-label="Versiones guardadas" className="mt-2 divide-y divide-border rounded-xl border border-border">
          {history.entries.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.label ?? 'Sin nombre'}</p>
                  <p className="truncate text-xs text-muted">
                    {entry.user.name ?? entry.user.email} ·{' '}
                    <time dateTime={entry.createdAt} title={fullDate(entry.createdAt)}>
                      {relativeDate(entry.createdAt)}
                    </time>
                  </p>
                </div>
                {canRestore && confirming !== entry.id && (
                  <Button variant="secondary" size="sm" disabled={busy !== null} aria-label={`Restaurar ${entry.label ?? 'versión sin nombre'}`} onClick={() => setConfirming(entry.id)}>
                    Restaurar
                  </Button>
                )}
              </div>
              {confirming === entry.id && (
                <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
                  <p>Tu página volverá a como estaba en esta versión. Lo que tienes ahora se guarda antes en el historial, así que puedes deshacerlo.</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" disabled={busy !== null} onClick={() => void restore(entry)}>
                      {busy === 'restoring' ? 'Restaurando…' : 'Sí, restaurar'}
                    </Button>
                    <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => setConfirming(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
