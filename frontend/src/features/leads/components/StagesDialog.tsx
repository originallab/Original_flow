import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { LeadStage } from '@/services/leads';
import { stageNameProblem } from '@/shared/leadStages';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { TextField } from '@/shared/ui/TextField';
import type { SaveResult } from '../useLeadsBoard';

interface Actions {
  onAdd: (name: string) => Promise<SaveResult>;
  onRename: (id: string, name: string) => Promise<SaveResult>;
  /** `order`: la posición nueva, desde 1. */
  onMove: (id: string, order: number) => Promise<SaveResult>;
  onRemove: (id: string) => Promise<SaveResult>;
}

interface Props extends Actions {
  stages: LeadStage[];
  onClose: () => void;
}

type Run = (action: () => Promise<SaveResult>) => Promise<SaveResult>;

const ICON_BUTTON = 'grid size-8 place-items-center rounded-lg border border-border text-text-2 transition hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-40';

/** Una etapa: su nombre (se renombra), subir, bajar y quitar (con confirmación). */
function StageRow({ stage, index, stages, busy, run, onRename, onMove, onRemove }: { stage: LeadStage; index: number; stages: LeadStage[]; busy: boolean; run: Run } & Omit<Actions, 'onAdd'>) {
  const [name, setName] = useState(stage.name);
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const protectedStage = stage.isFinal || stage.isWon;
  // Nada pasa de la etapa final: la que está justo antes de ella no baja más.
  const beforeFinal = stages[index + 1]?.isFinal === true;

  async function rename(event: FormEvent) {
    event.preventDefault();
    const problem = stageNameProblem(name);
    if (problem) return setError(problem);
    setError(undefined);
    const result = await run(() => onRename(stage.id, name.trim()));
    if (!result.ok) setError(result.fields.name);
  }

  async function remove() {
    await run(() => onRemove(stage.id));
    setConfirming(false);
  }

  return (
    <li className="rounded-xl border border-border bg-surface-2 p-3">
      <form onSubmit={rename} noValidate aria-label={`Renombrar ${stage.name}`} className="flex items-start gap-2">
        <div className="flex-1">
          <TextField label={`Nombre de la etapa ${index + 1}`} value={name} error={error} onChange={(event) => (setName(event.target.value), setError(undefined))} />
        </div>
        <Button type="submit" size="sm" variant="secondary" className="mt-7" disabled={busy || name.trim() === stage.name}>
          Guardar
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={ICON_BUTTON} aria-label={`Subir ${stage.name}`} disabled={busy || index === 0 || stage.isFinal} onClick={() => void run(() => onMove(stage.id, index))}>
          <ChevronUp size={16} aria-hidden />
        </button>
        <button type="button" className={ICON_BUTTON} aria-label={`Bajar ${stage.name}`} disabled={busy || stage.isFinal || beforeFinal} onClick={() => void run(() => onMove(stage.id, index + 2))}>
          <ChevronDown size={16} aria-hidden />
        </button>
        <button type="button" className={ICON_BUTTON} aria-label={`Quitar ${stage.name}`} title={protectedStage ? 'Esta etapa no se puede quitar' : undefined} disabled={busy || protectedStage} onClick={() => setConfirming(true)}>
          <Trash2 size={15} aria-hidden />
        </button>
        {stage.isFinal && <span className="text-xs text-muted">Última etapa: la que se usa cuando alguien paga.</span>}
      </div>

      {confirming && (
        <div role="group" aria-label={`Confirmar quitar ${stage.name}`} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          <span>¿Quitar «{stage.name}»?</span>
          <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={remove}>
            Sí, quitar
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </li>
  );
}

/** Administrar las etapas del tablero: agregar, renombrar, ordenar y quitar. La última etapa (la que se usa al cobrar) siempre queda al final. */
export function StagesDialog({ stages, onClose, onAdd, onRename, onMove, onRemove }: Props) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newError, setNewError] = useState<string | undefined>();

  /** Un cambio a la vez: mientras corre se bloquean los botones, y si falla se explica por qué. */
  const run: Run = async (action) => {
    setBusy(true);
    setNotice(null);
    const result = await action();
    setBusy(false);
    if (!result.ok && result.message) setNotice(result.message);
    return result;
  };

  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = stageNameProblem(newName);
    if (problem) return setNewError(problem);
    setNewError(undefined);
    const result = await run(() => onAdd(newName.trim()));
    if (result.ok) setNewName('');
    else setNewError(result.fields.name);
  }

  return (
    <Modal title="Etapas del tablero" onClose={onClose} locked={busy}>
      <p className="text-sm text-text-2">Cambia cómo se ordenan tus leads. Una etapa nueva entra justo antes de la última; la última no se mueve ni se quita, y tampoco una etapa que todavía tiene leads.</p>

      {notice && (
        <p role="alert" className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      <ul aria-label="Etapas del tablero" className="mt-4 space-y-3">
        {stages.map((stage, index) => (
          <StageRow key={`${stage.id}-${stage.name}`} stage={stage} index={index} stages={stages} busy={busy} run={run} onRename={onRename} onMove={onMove} onRemove={onRemove} />
        ))}
      </ul>

      <form onSubmit={add} noValidate aria-label="Agregar una etapa" className="mt-4 flex items-start gap-2 border-t border-border pt-4">
        <div className="flex-1">
          <TextField label="Nueva etapa" value={newName} error={newError} onChange={(event) => (setNewName(event.target.value), setNewError(undefined))} />
        </div>
        <Button type="submit" size="sm" className="mt-7" disabled={busy}>
          Agregar etapa
        </Button>
      </form>

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Listo
        </Button>
      </div>
    </Modal>
  );
}
