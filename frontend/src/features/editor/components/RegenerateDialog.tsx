import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { generateFunnelPage, saveDesignSpec, type Funnel } from '@/services/funnels';
import { saveVersion } from '@/services/history';
import { aiErrorMessage } from '@/shared/ai';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { TextAreaField } from '@/shared/ui/TextAreaField';

interface Props {
  funnel: Funnel;
  token: string;
  /** Guarda lo pendiente del editor; `false` si no se pudo (campos con errores o sin conexión). */
  saveNow: () => Promise<boolean>;
  /** La página nueva: el editor cambia lo que muestra por ella, como al restaurar una versión. */
  onGenerated: (funnel: Funnel) => void;
  onClose: () => void;
}

const MAX_INSTRUCTION = 500;
const VERSION_LABEL = 'Antes de volver a generar con IA';

/**
 * Volver a generar la página completa con la IA. Reemplaza los textos de todos los bloques, así que antes se guarda
 * una versión con lo de ahora (se recupera desde el historial) y se conservan la plantilla, los colores y las
 * tipografías que la persona tiene. Solo se puede con la página en borrador: no se sobrescribe una publicada.
 */
export function RegenerateDialog({ funnel, token, saveNow, onGenerated, onClose }: Props) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setMessage(null);
    setBusy(true);
    try {
      if (!(await saveNow())) {
        setMessage('Corrige los campos marcados de la página antes de volver a generarla: lo que tienes ahora se guarda para poder deshacer.');
        return;
      }
      // Lo de ahora queda en el historial: si la nueva no gusta, se vuelve a esta versión.
      await saveVersion(token, funnel.id, VERSION_LABEL);
      const text = instruction.trim();
      const generated = await generateFunnelPage(token, funnel.id, text ? { instruction: text } : {});
      // La IA propone su propia plantilla y colores; la persona ya eligió los suyos.
      let result = generated;
      if (funnel.designSpec) {
        await saveDesignSpec(token, funnel.id, funnel.designSpec);
        result = { ...generated, designSpec: funnel.designSpec };
      }
      onGenerated(result);
      onClose();
    } catch (err) {
      if (alive.current) setMessage(aiErrorMessage(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <Modal title="Volver a generar con IA" onClose={onClose} locked={busy}>
      <form onSubmit={(event) => void submit(event)} className="mt-4">
        <p className="text-sm text-text-2">
          La IA va a escribir de nuevo los textos de toda la página. Se conservan tu plantilla, tus colores y tus tipografías. Antes se guarda una versión con lo que tienes ahora, para que puedas volver desde el Historial.
        </p>
        <div className="mt-4">
          <TextAreaField
            label="¿Qué quieres que cambie? (opcional)"
            hint="Por ejemplo: más corto, tono más formal, enfocado en emprendedores."
            value={instruction}
            maxLength={MAX_INSTRUCTION}
            disabled={busy}
            onChange={(event) => setInstruction(event.target.value)}
          />
        </div>
        {message && (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {message}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            {busy ? 'Generando…' : 'Generar de nuevo'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
