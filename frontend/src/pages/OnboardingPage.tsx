import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { BrandPreview } from '@/features/workspaces/components/BrandPreview';
import { BusinessForm } from '@/features/workspaces/components/BusinessForm';
import { LogoUpload } from '@/features/workspaces/components/LogoUpload';
import { LoadState } from '@/features/workspaces/LoadState';
import { PaletteEditor } from '@/features/workspaces/components/PaletteEditor';
import { AI_SAMPLE_PALETTE, SUGGESTED_PALETTE, valuesOf } from '@/features/workspaces/brand';
import { useLogoFile } from '@/features/workspaces/useLogoFile';
import { useWorkspaces } from '@/features/workspaces/WorkspaceProvider';
import { ApiError } from '@/services/api';
import { createWorkspace, updateWorkspace, type BrandPalette, type Workspace } from '@/services/workspaces';
import { Button } from '@/shared/ui/Button';
import { Stepper } from '@/shared/ui/Stepper';

type Step = 'welcome' | 'business' | 'brand';
const STEPS = ['Bienvenida', 'Tu negocio', 'Marca'];
const INDEX: Record<Step, number> = { welcome: 0, business: 1, brand: 2 };

/**
 * Alta del negocio en tres pasos: bienvenida, datos del negocio (se crea al continuar) y marca
 * (paleta editable a mano). Si la persona ya tiene un negocio, empieza directo en «Tu negocio».
 * Subir el logo y generar la paleta con IA llegan en una pieza posterior.
 */
export function OnboardingPage() {
  // El paso inicial depende de si ya hay negocios: hay que esperar a saberlo (por ejemplo, al recargar esta pantalla).
  const { status } = useWorkspaces();
  if (status !== 'ready') {
    return (
      <div className="grid place-items-center pt-20">
        <LoadState />
      </div>
    );
  }
  return <OnboardingSteps />;
}

function OnboardingSteps() {
  const { token } = useAuth();
  const { workspaces, upsert } = useWorkspaces();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(workspaces.length === 0 ? 'welcome' : 'business');
  const [created, setCreated] = useState<Workspace | null>(null);
  const [palette, setPalette] = useState<BrandPalette>(SUGGESTED_PALETTE);
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);
  const { logo, choose, clear } = useLogoFile();
  const [suggested, setSuggested] = useState(false);

  async function createBusiness(values: ReturnType<typeof valuesOf>) {
    if (!token) return;
    const workspace = await createWorkspace(token, {
      name: values.name,
      ...(values.country ? { country: values.country } : {}),
      ...(values.website ? { website: values.website } : {}),
      ...(values.industry ? { industry: values.industry } : {}),
    });
    upsert(workspace, { activate: true });
    setCreated(workspace);
    setStep('brand');
  }

  async function saveBrand() {
    if (!token || !created) return;
    setBrandBusy(true);
    setBrandError(null);
    try {
      const updated = await updateWorkspace(token, created.id, { brandPalette: palette });
      upsert(updated, { activate: true });
      navigate('/', { replace: true });
    } catch (err) {
      setBrandError(err instanceof ApiError ? err.message : 'No se pudo guardar la marca. Intenta de nuevo.');
    } finally {
      setBrandBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex justify-center">
        <Stepper steps={STEPS} current={INDEX[step]} />
      </div>

      <section className="mt-8 rounded-2xl border border-border bg-surface p-8 shadow-popover">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-tint-text">
          Paso {INDEX[step] + 1} de {STEPS.length}
        </p>

        {step === 'welcome' && (
          <>
            <h1 className="mt-2 font-heading text-2xl font-semibold">Bienvenido a Original Flow</h1>
            <p className="mt-2 text-text-2">
              En dos pasos dejamos tu negocio listo: primero tus datos y después tu marca, para que tus páginas se vean como tú. Podrás
              editarlo todo después.
            </p>
            <div className="mt-8 flex justify-end">
              <Button onClick={() => setStep('business')}>
                Empezar <ArrowRight size={16} aria-hidden />
              </Button>
            </div>
          </>
        )}

        {step === 'business' && (
          <>
            <h1 className="mt-2 font-heading text-2xl font-semibold">Cuéntanos sobre tu negocio</h1>
            <p className="mt-2 mb-6 text-text-2">Usamos estos datos para personalizar tus plantillas y tus páginas.</p>
            <BusinessForm
              initial={valuesOf(null)}
              submitLabel="Continuar"
              onSubmit={createBusiness}
              hint="Podrás editar todo esto después"
              leading={
                workspaces.length === 0 ? (
                  <Button variant="ghost" onClick={() => setStep('welcome')}>
                    <ArrowLeft size={16} aria-hidden /> Atrás
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => navigate('/')}>
                    Cancelar
                  </Button>
                )
              }
            />
          </>
        )}

        {step === 'brand' && created && (
          <>
            <h1 className="mt-2 font-heading text-2xl font-semibold">Configura tu marca</h1>
            <p className="mt-2 mb-6 text-text-2">
              Sube una imagen de tu marca para que la IA te proponga una paleta, o elige los colores a mano. Se usarán en tus landing pages
              publicadas, nunca en la plataforma de Original Flow.
            </p>
            <LogoUpload
              logo={logo}
              onChoose={(file) => {
                setSuggested(false);
                return choose(file);
              }}
              onClear={() => {
                clear();
                setSuggested(false);
              }}
              onSuggest={() => {
                setPalette(AI_SAMPLE_PALETTE);
                setSuggested(true);
              }}
              suggested={suggested}
            />
            <div className="mt-6">
              <PaletteEditor value={palette} onChange={setPalette} />
            </div>
            <div className="mt-6">
              <BrandPreview palette={palette} name={created.name} logoSrc={logo?.url} />
            </div>
            {brandError && (
              <p role="alert" className="mt-4 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text">
                {brandError}
              </p>
            )}
            <div className="mt-8 flex items-center justify-between gap-4">
              <Button variant="ghost" onClick={() => navigate('/', { replace: true })}>
                Omitir por ahora
              </Button>
              <p className="hidden text-xs text-muted sm:block">Podrás editar todo esto después</p>
              <Button onClick={() => void saveBrand()} disabled={brandBusy}>
                {brandBusy ? 'Guardando…' : 'Guardar y continuar'}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
