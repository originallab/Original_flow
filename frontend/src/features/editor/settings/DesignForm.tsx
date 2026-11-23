import { useState } from 'react';
import { resolveTheme } from '@/features/pageRenderer/theme';
import { saveDesignSpec, type Funnel } from '@/services/funnels';
import type { DesignSpec } from '@/shared/blocks/types';
import { ALIGNS, BACKDROPS, BODY_FONTS, BUTTONS, DENSITIES, DIVIDERS, EFFECTS, HEADING_CASES, HEADING_FONTS, HEADING_WEIGHTS, RADII, SURFACES, type PageLook } from '@/shared/design';
import { SelectField } from '@/shared/ui/SelectField';

interface Props {
  funnel: Funnel;
  token: string;
  onSaved: (funnel: Funnel) => void;
}

const RADIUS_LABELS: Record<(typeof RADII)[number], string> = { none: 'Rectas', sm: 'Casi rectas', md: 'Redondeadas', lg: 'Muy redondeadas', pill: 'Como píldora' };
const DENSITY_LABELS: Record<(typeof DENSITIES)[number], string> = { compact: 'Compacto', normal: 'Normal', airy: 'Con mucho aire' };
const ALIGN_LABELS: Record<(typeof ALIGNS)[number], string> = { left: 'A la izquierda', center: 'Centrado' };
const CASE_LABELS: Record<(typeof HEADING_CASES)[number], string> = { normal: 'Normales', upper: 'En mayúsculas' };
const SURFACE_LABELS: Record<(typeof SURFACES)[number], string> = { flat: 'Planas', outline: 'Con borde', elevated: 'Con sombra', glass: 'De vidrio', glow: 'Con brillo' };
const EFFECT_LABELS: Record<(typeof EFFECTS)[number], string> = { none: 'Sin efecto', gradient: 'Con degradado', glow: 'Con brillo', underline: 'Subrayados' };
const BACKDROP_LABELS: Record<(typeof BACKDROPS)[number], string> = { plain: 'Liso', gradient: 'Degradado suave', grid: 'Cuadrícula', dots: 'Puntos', glow: 'Resplandor' };
const DIVIDER_LABELS: Record<(typeof DIVIDERS)[number], string> = { none: 'Rectos', slant: 'En diagonal' };
const BUTTON_LABELS: Record<(typeof BUTTONS)[number], string> = { solid: 'Sólidos', gradient: 'Con degradado', glow: 'Con brillo' };
const WEIGHT_LABELS: Record<(typeof HEADING_WEIGHTS)[number], string> = { 500: 'Ligeros', 600: 'Medios', 700: 'Gruesos', 800: 'Muy gruesos' };

/**
 * El aspecto de toda la página: tipografías, esquinas, aire, alineación y títulos. Cada cambio se guarda al momento;
 * lo que no se toca lo decide la plantilla. Los colores salen de la paleta del negocio.
 */
export function DesignForm({ funnel, token, onSaved }: Props) {
  const design: DesignSpec = funnel.designSpec ?? { template: 'claridad' };
  /** Las tipografías que se están usando (las propias de la página o las de su plantilla). */
  const effectiveFonts = resolveTheme(design).fonts;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: DesignSpec) {
    setBusy(true);
    setError(null);
    try {
      const { designSpec } = await saveDesignSpec(token, funnel.id, next);
      onSaved({ ...funnel, designSpec });
    } catch {
      setError('No se pudo guardar el diseño. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const setLook = <K extends keyof PageLook>(key: K, value: PageLook[K] | '') => {
    const look: PageLook = { ...design.look };
    if (value === '') delete look[key];
    else look[key] = value as PageLook[K];
    const next: DesignSpec = { ...design, look };
    if (Object.keys(look).length === 0) delete next.look;
    void save(next);
  };
  const setFont = (key: 'heading' | 'body', value: string) => {
    void save({ ...design, fonts: { ...effectiveFonts, [key]: value } });
  };

  const look = design.look ?? {};
  return (
    <section aria-labelledby="ajustes-diseno-titulo" className="space-y-3">
      <h3 id="ajustes-diseno-titulo" className="font-heading text-base font-semibold">
        Diseño de la página
      </h3>
      <p className="text-xs text-text-2">Lo que no cambies lo decide la plantilla. Los colores salen de la paleta de tu negocio.</p>
      <SelectField label="Tipografía de los títulos" disabled={busy} value={effectiveFonts.heading} onChange={(e) => setFont('heading', e.target.value)}>
        {HEADING_FONTS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </SelectField>
      <SelectField label="Tipografía del texto" disabled={busy} value={effectiveFonts.body} onChange={(e) => setFont('body', e.target.value)}>
        {BODY_FONTS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </SelectField>
      <SelectField label="Esquinas" disabled={busy} value={look.radius ?? ''} onChange={(e) => setLook('radius', e.target.value as PageLook['radius'] | '')}>
        <option value="">La de la plantilla</option>
        {RADII.map((value) => (
          <option key={value} value={value}>
            {RADIUS_LABELS[value]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Espacio entre secciones" disabled={busy} value={look.density ?? ''} onChange={(e) => setLook('density', e.target.value as PageLook['density'] | '')}>
        <option value="">El de la plantilla</option>
        {DENSITIES.map((value) => (
          <option key={value} value={value}>
            {DENSITY_LABELS[value]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Alineación del texto" disabled={busy} value={look.align ?? ''} onChange={(e) => setLook('align', e.target.value as PageLook['align'] | '')}>
        <option value="">La de la plantilla</option>
        {ALIGNS.map((value) => (
          <option key={value} value={value}>
            {ALIGN_LABELS[value]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Títulos" disabled={busy} value={look.headingCase ?? ''} onChange={(e) => setLook('headingCase', e.target.value as PageLook['headingCase'] | '')}>
        <option value="">Los de la plantilla</option>
        {HEADING_CASES.map((value) => (
          <option key={value} value={value}>
            {CASE_LABELS[value]}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Grosor de los títulos"
        disabled={busy}
        value={look.headingWeight ?? ''}
        onChange={(e) => setLook('headingWeight', (e.target.value === '' ? '' : Number(e.target.value)) as PageLook['headingWeight'] | '')}
      >
        <option value="">El de la plantilla</option>
        {HEADING_WEIGHTS.map((value) => (
          <option key={value} value={value}>
            {WEIGHT_LABELS[value]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Tarjetas" disabled={busy} value={look.surface ?? ''} onChange={(e) => setLook('surface', e.target.value as PageLook['surface'] | '')}>
        <option value="">Las de la plantilla</option>
        {SURFACES.map((value) => (
          <option key={value} value={value}>
            {SURFACE_LABELS[value]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Efecto de los títulos" disabled={busy} value={look.effect ?? ''} onChange={(e) => setLook('effect', e.target.value as PageLook['effect'] | '')}>
        <option value="">Ninguno</option>
        {EFFECTS.filter((value) => value !== 'none').map((value) => (
          <option key={value} value={value}>
            {EFFECT_LABELS[value]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Fondo de la página" disabled={busy} value={look.backdrop ?? ''} onChange={(e) => setLook('backdrop', e.target.value as PageLook['backdrop'] | '')}>
        <option value="">Liso</option>
        {BACKDROPS.filter((value) => value !== 'plain').map((value) => (
          <option key={value} value={value}>
            {BACKDROP_LABELS[value]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Corte entre secciones" disabled={busy} value={look.divider ?? ''} onChange={(e) => setLook('divider', e.target.value as PageLook['divider'] | '')}>
        <option value="">Rectos</option>
        {DIVIDERS.filter((value) => value !== 'none').map((value) => (
          <option key={value} value={value}>
            {DIVIDER_LABELS[value]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Botones" disabled={busy} value={look.button ?? ''} onChange={(e) => setLook('button', e.target.value as PageLook['button'] | '')}>
        <option value="">Sólidos</option>
        {BUTTONS.filter((value) => value !== 'solid').map((value) => (
          <option key={value} value={value}>
            {BUTTON_LABELS[value]}
          </option>
        ))}
      </SelectField>
      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
    </section>
  );
}
