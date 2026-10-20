import { Button } from '@/shared/ui/Button';

interface Props {
  label: string;
  /** Hay cambios sin guardar. */
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  /** «ok»: se guardó; «error»: no se pudo (el detalle va en `message`). */
  result: { kind: 'ok' | 'error'; message: string } | null;
  hint?: string;
}

/** Pie de un formulario de ajustes: el botón de guardar, si hay cambios sin guardar y cómo salió. */
export function SaveBar({ label, dirty, busy, onSave, result, hint }: Props) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button size="sm" disabled={!dirty || busy} onClick={onSave}>
        {busy ? 'Guardando…' : label}
      </Button>
      {dirty && !busy && !result && <span className="text-xs text-muted">{hint ?? 'Tienes cambios sin guardar.'}</span>}
      {result && (
        <span role={result.kind === 'error' ? 'alert' : 'status'} className={result.kind === 'error' ? 'text-xs text-red-500' : 'text-xs text-violet-tint-text'}>
          {result.message}
        </span>
      )}
    </div>
  );
}
