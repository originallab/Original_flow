import { ArrowLeft, ArrowUpRight, Info, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { EMPTY_BRIEF, GOALS, TEMPLATES, TONES, WIZARD_STEPS } from '@/features/funnels/catalog';
import { BriefForm } from '@/features/funnels/components/BriefForm';
import { ChoiceCard } from '@/features/funnels/components/ChoiceCard';
import { TemplateThumb } from '@/features/funnels/components/TemplateThumb';
import { WizardRail } from '@/features/funnels/components/WizardRail';
import { createDraft, fillDraft, type GenerationInput } from '@/features/funnels/generation';
import { useWorkspaces } from '@/features/workspaces/WorkspaceProvider';
import { ApiError } from '@/services/api';
import type { Funnel } from '@/services/funnels';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';

const HEADINGS = [
  { title: '¿Qué quieres lograr con este funnel?', text: 'Elige el objetivo principal. Vas a poder ajustar cada detalle más adelante, incluyendo con ayuda de Original AI Engine.' },
  { title: 'Cuéntanos de tu producto y tu público', text: 'Este formulario son las instrucciones que usará la IA para armar tu página. Entre más detalle des, mejor saldrá.' },
  { title: 'Elige una plantilla', text: 'Un punto de partida ya diseñado. Lo personalizas con la marca de tu negocio.' },
  { title: 'Todo listo para generar tu funnel', text: 'Revisa el resumen. Podrás cambiar cualquier cosa en el editor.' },
];

/**
 * Asistente de creación (4 pasos, según el mockup del Wizard). Al final crea el funnel en borrador,
 * arma su página (hoy con la plantilla elegida; más adelante con IA, ver `features/funnels/generation`)
 * y abre el editor para que la persona la modifique.
 */
export function NewFunnelPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { active } = useWorkspaces();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El borrador ya creado: si armar la página falla, se reintenta sobre el mismo funnel (no se crea otro).
  const draft = useRef<Funnel | null>(null);
  const [goalId, setGoalId] = useState(GOALS[0]!.id);
  const [templateId, setTemplateId] = useState(TEMPLATES[0]!.id);
  const [brief, setBrief] = useState(EMPTY_BRIEF);

  const last = step === WIZARD_STEPS.length - 1;
  const goal = GOALS.find((g) => g.id === goalId)!;
  const template = TEMPLATES.find((t) => t.id === templateId)!;
  const heading = HEADINGS[step]!;

  async function generate() {
    if (!token || !active || busy) return;
    const input: GenerationInput = { workspace: active, objective: goalId, brief, templateId };
    setBusy(true);
    setError(null);
    try {
      draft.current ??= await createDraft(token, input);
      await fillDraft(token, draft.current, input);
      navigate(`/funnels/${draft.current.id}/editor`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo generar tu funnel. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1">
      <WizardRail current={step} />

      <main className="flex min-w-0 flex-1 flex-col px-6 py-10 md:px-12">
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
          <p className="text-sm text-muted">
            Paso {step + 1} de {WIZARD_STEPS.length}
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold">{heading.title}</h1>
          <p className="mt-3 max-w-xl text-text-2">{heading.text}</p>

          <div className="mt-8 flex-1">
            {step === 0 && (
              <div role="radiogroup" aria-label="Objetivo del funnel" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {GOALS.map(({ id, name: label, description, icon: Icon, available }) => {
                  const selected = id === goalId;
                  return (
                    <ChoiceCard key={id} group="objetivo" value={id} label={label} selected={selected} disabled={!available} onSelect={() => setGoalId(id)}>
                      <span className={cn('grid size-10 place-items-center rounded-lg', selected ? 'bg-violet text-on-violet' : 'bg-chip text-text-2')}>
                        <Icon size={18} aria-hidden />
                      </span>
                      <span className="mt-4 font-medium">{label}</span>
                      <span className="mt-1 text-sm text-text-2">{description}</span>
                      {!available && <span className="mt-3 w-fit rounded-full bg-chip px-2 py-0.5 text-xs text-text-2">Próximamente</span>}
                    </ChoiceCard>
                  );
                })}
              </div>
            )}

            {step === 1 && (
              <BriefForm value={brief} onChange={setBrief} />
            )}

            {step === 2 && (
              <div role="radiogroup" aria-label="Plantilla" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {TEMPLATES.map((t) => (
                  <ChoiceCard key={t.id} group="plantilla" value={t.id} label={t.name} selected={t.id === templateId} onSelect={() => setTemplateId(t.id)}>
                    <TemplateThumb template={t} />
                    <span className="mt-4 font-medium">{t.name}</span>
                    <span className="mt-1 w-fit rounded-md bg-chip px-2 py-0.5 text-xs text-text-2">{t.tag}</span>
                    <span className="mt-2 text-sm text-text-2">{t.description}</span>
                  </ChoiceCard>
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="max-w-2xl">
                <dl className="divide-y divide-border rounded-xl border border-border bg-surface">
                  {[
                    ['Objetivo', goal.name],
                    ['Nombre del funnel', brief.name.trim() || 'Sin nombre'],
                    ['Qué ofreces', brief.offer.trim() || 'Sin definir'],
                    ['Resultado para tu cliente', brief.result.trim() || 'Sin definir'],
                    ['Precio u oferta', brief.price.trim() || 'Sin definir'],
                    ['Público', brief.audience.trim() || 'Sin definir'],
                    ['Dudas u objeciones', brief.objections.trim() || 'Sin definir'],
                    ['Tono', TONES.find((t) => t.id === brief.tone)?.name ?? 'Sin definir'],
                    ['Botón principal', brief.cta.trim() || 'Sin definir'],
                    ['Instrucciones adicionales', brief.extra.trim() || 'Sin definir'],
                    ['Plantilla', `${template.name} · ${template.tag}`],
                  ].map(([term, value]) => (
                    <div key={term} className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]">
                      <dt className="text-sm text-muted">{term}</dt>
                      <dd className="whitespace-pre-line break-words text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p role="note" className="mt-4 flex items-start gap-2 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text-2">
                  <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
                  Por ahora la página se arma con la plantilla que elegiste y lo que escribiste; la generación con IA llegará más adelante. Después podrás
                  modificar todo en el editor.
                </p>
                {error && (
                  <p role="alert" className="mt-3 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-10 flex items-center justify-end gap-3 border-t border-border pt-6">
            <Button
              variant="secondary"
              disabled={step === 0 || busy}
              onClick={() => {
                // Si cambia lo elegido, el borrador anterior ya no corresponde: se crea uno nuevo al generar.
                draft.current = null;
                setStep((s) => s - 1);
              }}
            >
              <ArrowLeft size={16} aria-hidden /> Atrás
            </Button>
            {last ? (
              <Button onClick={() => void generate()} disabled={busy}>
                <Sparkles size={16} aria-hidden /> {busy ? 'Generando…' : 'Generar funnel'}
              </Button>
            ) : (
              <Button onClick={() => setStep((s) => s + 1)}>
                Continuar <ArrowUpRight size={16} aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
