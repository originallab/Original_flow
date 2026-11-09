import { CheckCircle2, Circle, CircleAlert, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/services/api';
import { getFunnel, listCtas, publishFunnel, unpublishFunnel, type Cta, type Funnel } from '@/services/funnels';
import type { Block, BlockType } from '@/shared/blocks/types';
import { FUNNEL_TYPES } from '@/shared/funnelTypes';
import { findPublishProblems, type PublishProblem } from '@/shared/publish';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { publicUrl } from '@/shared/utils/publicUrl';
import { cn } from '@/shared/utils/cn';

export type SettingsSection = 'details' | 'type' | 'cta';

interface Props {
  funnel: Funnel;
  token: string;
  blocks: Block[];
  /** Hay ajustes escritos que todavía no se guardaron (no cuentan para publicar). */
  settingsDirty: boolean;
  /** Guarda lo pendiente de la página. Devuelve `false` si hay cambios que no se pudieron guardar. */
  saveNow: () => Promise<boolean>;
  onFunnelChange: (funnel: Funnel) => void;
  onGoToSettings: (section: SettingsSection) => void;
  onAddBlock: (type: BlockType) => void;
  onClose: () => void;
}

type Phase = 'checking' | 'unsaved' | 'failed' | 'ready' | 'publishing' | 'published';

interface Requirement {
  code: string;
  label: string;
  /** Qué botón ofrecer cuando falta. */
  fix?: { label: string; run: () => void };
}

/** Los requisitos que aplican a este tipo de funnel, con lo que se puede hacer para cumplirlos. */
function requirementsFor(funnel: Funnel, actions: { settings: (s: SettingsSection) => void; add: (t: BlockType) => void }): Requirement[] {
  const def = FUNNEL_TYPES[funnel.objective];
  const list: Requirement[] = [{ code: 'CONTENT_EMPTY', label: 'La página tiene contenido', fix: { label: 'Agregar un bloque', run: () => actions.add('encabezado') } }];
  if (def.fields.length > 0) list.push({ code: 'TYPE_CONFIG_INCOMPLETE', label: 'Los ajustes del funnel están completos', fix: { label: 'Ir a ajustes', run: () => actions.settings('type') } });
  if (def.primaryCta === 'form_submit') list.push({ code: 'FORM_MISSING', label: 'Tiene un formulario', fix: { label: 'Agregar formulario', run: () => actions.add('formulario') } });
  if (def.primaryCta === 'checkout') list.push({ code: 'CHECKOUT_BUTTON_MISSING', label: 'Tiene un botón de pago', fix: { label: 'Agregar botón', run: () => actions.add('boton') } });
  if (def.charges) {
    list.push({ code: 'PRICE_MISSING', label: 'Tiene un precio mayor a cero', fix: { label: 'Ir a ajustes', run: () => actions.settings('details') } });
    list.push({ code: 'PAYMENTS_NOT_CONNECTED', label: 'Original Pay está conectado' });
  }
  list.push({ code: 'CTA_DESTINATION_MISSING', label: 'Los botones con enlace tienen destino', fix: { label: 'Ir a ajustes', run: () => actions.settings('cta') } });
  return list;
}

/**
 * Ventana de publicar: antes de publicar revisa que el funnel cumpla todo (la misma lista que valida el
 * servidor, que siempre tiene la última palabra) y muestra lo que falta con un botón para arreglarlo.
 * Ya publicado, muestra la dirección de la página y permite despublicarla.
 */
export function PublishDialog({ funnel, token, blocks, settingsDirty, saveNow, onFunnelChange, onGoToSettings, onAddBlock, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [fresh, setFresh] = useState<Funnel>(funnel);
  const [ctas, setCtas] = useState<Cta[]>([]);
  const [serverProblems, setServerProblems] = useState<PublishProblem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase('checking');
    (async () => {
      if (!(await saveNow())) return !cancelled && setPhase('unsaved');
      const [loaded, loadedCtas] = await Promise.all([getFunnel(token, funnel.id), listCtas(token, funnel.id)]);
      if (cancelled) return;
      setFresh(loaded);
      setCtas(loadedCtas);
      setPhase(loaded.status === 'published' ? 'published' : 'ready');
    })().catch(() => !cancelled && setPhase('failed'));
    return () => {
      cancelled = true;
    };
    // Se revisa al abrir (y al reintentar); el guardado de la página es el de ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const localProblems = findPublishProblems({ objective: fresh.objective, price: fresh.price, typeConfig: fresh.typeConfig, blocks, ctas, hasPayments: null });
  const problems = [...localProblems, ...serverProblems.filter((p) => !localProblems.some((l) => l.code === p.code))];
  const requirements = requirementsFor(fresh, {
    settings: (section) => {
      onGoToSettings(section);
      onClose();
    },
    add: (type) => {
      onAddBlock(type);
      onClose();
    },
  });

  async function publish() {
    setPhase('publishing');
    setMessage(null);
    try {
      const published = await publishFunnel(token, fresh.id);
      setFresh(published);
      onFunnelChange(published);
      setServerProblems([]);
      setPhase('published');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'FUNNEL_NOT_READY') {
        const missing = (err.details as { missing?: PublishProblem[] } | null)?.missing ?? [];
        setServerProblems(missing);
        setMessage('El servidor encontró requisitos pendientes.');
      } else {
        setMessage(err instanceof ApiError ? err.message : 'No se pudo publicar. Intenta de nuevo.');
      }
      setPhase('ready');
    }
  }

  async function unpublish() {
    setPhase('publishing');
    try {
      const draft = await unpublishFunnel(token, fresh.id);
      setFresh(draft);
      onFunnelChange(draft);
      setConfirmingUnpublish(false);
      setPhase('ready');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo despublicar. Intenta de nuevo.');
      setPhase('published');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl(fresh.slug));
      setCopied(true);
    } catch {
      setMessage('No se pudo copiar. Selecciona el enlace y cópialo a mano.');
    }
  }

  const busy = phase === 'checking' || phase === 'publishing';

  return (
    <Modal title={phase === 'published' ? 'Tu funnel está publicado' : 'Publicar tu funnel'} onClose={onClose} locked={phase === 'publishing'}>
      {phase === 'checking' && (
        <p role="status" className="flex items-center gap-2 text-sm text-text-2">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Revisando tu funnel…
        </p>
      )}

      {phase === 'unsaved' && (
        <div>
          <p role="alert" className="text-sm">
            Hay cambios en la página que no se pudieron guardar. Corrígelos o reintenta el guardado antes de publicar.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Reintentar
            </Button>
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div>
          <p role="alert" className="text-sm">
            No se pudo revisar el funnel. Revisa tu conexión e intenta de nuevo.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Reintentar
            </Button>
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      )}

      {(phase === 'ready' || phase === 'publishing') && (
        <div>
          <p className="text-sm text-text-2">Antes de publicar, revisa que tu funnel cumpla esto:</p>
          <ul aria-label="Requisitos para publicar" className="mt-3 space-y-2">
            {requirements.map((requirement) => {
              const problem = problems.find((p) => p.code === requirement.code);
              const unknown = requirement.code === 'PAYMENTS_NOT_CONNECTED' && !problem;
              return (
                <li key={requirement.code} data-requirement={requirement.code} data-state={problem ? 'pending' : unknown ? 'unknown' : 'done'} className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
                  {problem ? <CircleAlert size={18} className="mt-0.5 shrink-0 text-red-500" aria-hidden /> : unknown ? <Circle size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-violet-tint-text" aria-hidden />}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className={cn(problem && 'font-medium')}>{requirement.label}</p>
                    {problem && <p className="text-xs text-text-2">{problem.message}</p>}
                    {unknown && <p className="text-xs text-muted">Se comprueba al publicar.</p>}
                  </div>
                  {problem && requirement.fix && (
                    <Button size="sm" variant="secondary" onClick={requirement.fix.run}>
                      {requirement.fix.label}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          {settingsDirty && (
            <p role="note" className="mt-3 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-xs text-text-2">
              Tienes ajustes sin guardar; no cuentan para publicar hasta que los guardes.
            </p>
          )}
          {message && (
            <p role="alert" className="mt-3 text-sm text-red-500">
              {message}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => void publish()} disabled={busy || localProblems.length > 0}>
              {phase === 'publishing' ? 'Publicando…' : 'Publicar ahora'}
            </Button>
          </div>
        </div>
      )}

      {phase === 'published' && (
        <div>
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 size={18} className="text-violet-tint-text" aria-hidden /> Cualquier cambio que hagas en el editor se verá al instante en la página publicada.
          </p>
          <label className="mt-4 block text-sm">
            <span className="text-text-2">Dirección de tu página</span>
            <input readOnly value={publicUrl(fresh.slug)} onFocus={(e) => e.currentTarget.select()} className="mt-1 w-full rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text" />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void copy()}>
              <Copy size={14} aria-hidden /> {copied ? 'Copiado' : 'Copiar enlace'}
            </Button>
            <a href={publicUrl(fresh.slug)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium text-text-2 hover:text-text">
              <ExternalLink size={14} aria-hidden /> Abrir la página
            </a>
          </div>
          {message && (
            <p role="alert" className="mt-3 text-sm text-red-500">
              {message}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            {confirmingUnpublish ? (
              <>
                <span className="mr-auto self-center text-sm text-text-2">La página dejará de verse de inmediato.</span>
                <Button variant="ghost" onClick={() => setConfirmingUnpublish(false)}>
                  Cancelar
                </Button>
                <Button variant="secondary" onClick={() => void unpublish()}>
                  Sí, despublicar
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setConfirmingUnpublish(true)}>
                  Despublicar
                </Button>
                <Button onClick={onClose}>Listo</Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
