import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { regenerateBlock, type BlockProposal } from '@/services/funnels';
import { aiErrorMessage, describeContent } from '@/shared/ai';
import type { Block } from '@/shared/blocks/types';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';

interface Props {
  block: Block;
  token: string;
  funnelId: string;
  /** Guarda lo pendiente del editor; `false` si no se pudo (campos con errores o sin conexión). */
  saveNow: () => Promise<boolean>;
  /** La persona aceptó la propuesta: el editor pone ese contenido en el bloque (y lo autoguarda). */
  onApply: (content: Record<string, unknown>) => void;
}

const MAX_INSTRUCTION = 500;

/**
 * «Reescribir con IA» en el panel de un bloque. La IA propone un texto nuevo y se le muestra a la persona; no se
 * guarda nada hasta que pulsa «Usar esta propuesta», así que siempre puede descartarla. La propuesta se pide sobre lo
 * último guardado, por eso antes se guarda lo pendiente.
 */
export function AiBlockAssistant({ block, token, funnelId, saveNow, onApply }: Props) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<BlockProposal | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function ask() {
    if (busy) return;
    setMessage(null);
    setBusy(true);
    try {
      if (!(await saveNow())) {
        if (alive.current) setMessage('Corrige los campos marcados de la página antes de pedirle una propuesta a la IA.');
        return;
      }
      const text = instruction.trim();
      const result = await regenerateBlock(token, funnelId, block.key, text ? { instruction: text } : {});
      if (alive.current) setProposal(result);
    } catch (err) {
      if (alive.current) setMessage(aiErrorMessage(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  function accept() {
    if (!proposal) return;
    onApply(proposal.content);
    setProposal(null);
    setInstruction('');
  }

  return (
    <section aria-label="Reescribir con IA" className="mt-6 rounded-xl border border-border bg-surface-2 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles size={15} aria-hidden className="text-violet" /> Reescribir con IA
      </h3>

      {!proposal && (
        <>
          <div className="mt-3">
            <TextField
              label="¿Qué quieres cambiar? (opcional)"
              hint="Por ejemplo: más corto, tono más formal."
              value={instruction}
              maxLength={MAX_INSTRUCTION}
              disabled={busy}
              onChange={(event) => setInstruction(event.target.value)}
            />
          </div>
          <Button size="sm" className="mt-3" disabled={busy} onClick={() => void ask()}>
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            {busy ? 'Escribiendo…' : 'Reescribir con IA'}
          </Button>
        </>
      )}

      {message && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {message}
        </p>
      )}

      {proposal && (
        <div role="region" aria-label="Propuesta de la IA" className="mt-3">
          <p className="text-xs text-muted">Esta es la propuesta. No se guarda hasta que la uses.</p>
          <dl className="mt-2 space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
            {describeContent(block.type, proposal.content).map((line) => (
              <div key={`${line.label}:${line.text}`}>
                <dt className="text-xs text-muted">{line.label}</dt>
                <dd className="whitespace-pre-line">{line.text}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={accept}>
              Usar esta propuesta
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void ask()}>
              {busy ? 'Escribiendo…' : 'Pedir otra'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>
              Descartar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
