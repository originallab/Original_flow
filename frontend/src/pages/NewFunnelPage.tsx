import { ArrowLeft, ArrowUpRight, Info, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GOALS, TEMPLATES, WIZARD_STEPS } from '@/features/funnels/catalog';
import { ChoiceCard } from '@/features/funnels/components/ChoiceCard';
import { TemplateThumb } from '@/features/funnels/components/TemplateThumb';
import { WizardRail } from '@/features/funnels/components/WizardRail';
import { Button } from '@/shared/ui/Button';
import { TextAreaField } from '@/shared/ui/TextAreaField';
import { TextField } from '@/shared/ui/TextField';
import { cn } from '@/shared/utils/cn';

const HEADINGS = [
  { title: '¿Qué quieres lograr con este funnel?', text: 'Elige el objetivo principal. Vas a poder ajustar cada detalle más adelante, incluyendo con ayuda de Original AI Engine.' },
  { title: 'Cuéntanos de tu producto y tu público', text: 'Con esto la IA entiende qué ofreces y a quién se lo ofreces.' },
  { title: 'Elige una plantilla', text: 'Un punto de partida ya diseñado. Lo personalizas con la marca de tu negocio.' },
  { title: 'Todo listo para generar tu funnel', text: 'Revisa el resumen. Podrás cambiar cualquier cosa en el editor.' },
];

/**
 * CÁSCARA del asistente de creación (4 pasos, según el mockup del Wizard): navega entre los pasos y
 * guarda lo elegido solo en la pantalla. Todavía no llama al backend ni genera nada con IA: al final
 * vuelve a la lista de funnels.
 */
export function NewFunnelPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [goalId, setGoalId] = useState(GOALS[0]!.id);
  const [templateId, setTemplateId] = useState(TEMPLATES[0]!.id);
  const [name, setName] = useState('');
  const [offer, setOffer] = useState('');
  const [audience, setAudience] = useState('');

  const last = step === WIZARD_STEPS.length - 1;
  const goal = GOALS.find((g) => g.id === goalId)!;
  const template = TEMPLATES.find((t) => t.id === templateId)!;
  const heading = HEADINGS[step]!;

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
                {GOALS.map(({ id, name: label, description, icon: Icon }) => {
                  const selected = id === goalId;
                  return (
                    <ChoiceCard key={id} group="objetivo" value={id} label={label} selected={selected} onSelect={() => setGoalId(id)}>
                      <span className={cn('grid size-10 place-items-center rounded-lg', selected ? 'bg-violet text-on-violet' : 'bg-chip text-text-2')}>
                        <Icon size={18} aria-hidden />
                      </span>
                      <span className="mt-4 font-medium">{label}</span>
                      <span className="mt-1 text-sm text-text-2">{description}</span>
                    </ChoiceCard>
                  );
                })}
              </div>
            )}

            {step === 1 && (
              <div className="max-w-xl space-y-5">
                <TextField label="Nombre del funnel" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Curso de Excel · Inscripción" maxLength={120} />
                <TextAreaField label="¿Qué ofreces?" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Describe tu producto o servicio en pocas líneas." />
                <TextAreaField label="¿A quién va dirigido?" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Tu cliente ideal: quién es y qué problema tiene." />
              </div>
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
                    ['Nombre del funnel', name.trim() || 'Sin nombre'],
                    ['Qué ofreces', offer.trim() || 'Sin definir'],
                    ['Público', audience.trim() || 'Sin definir'],
                    ['Plantilla', `${template.name} · ${template.tag}`],
                  ].map(([term, value]) => (
                    <div key={term} className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]">
                      <dt className="text-sm text-muted">{term}</dt>
                      <dd className="text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p role="note" className="mt-4 flex items-start gap-2 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text-2">
                  <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
                  Esta pantalla es una maqueta: todavía no se genera nada con IA. Al continuar volverás a la lista de funnels.
                </p>
              </div>
            )}
          </div>

          <div className="mt-10 flex items-center justify-end gap-3 border-t border-border pt-6">
            <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft size={16} aria-hidden /> Atrás
            </Button>
            {last ? (
              <Button onClick={() => navigate('/funnels')}>
                <Sparkles size={16} aria-hidden /> Generar funnel
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
