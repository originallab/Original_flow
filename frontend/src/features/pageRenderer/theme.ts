import type { CSSProperties } from 'react';
import { templateOf } from '@/features/funnels/catalog';
import type { BrandPalette } from '@/services/workspaces';
import type { DesignSpec, TemplateId } from '@/shared/blocks/types';
import { isBodyFont, isHeadingFont, type BlockBackground, type PageLook } from '@/shared/design';

/**
 * Cómo se ve cada plantilla además de sus colores: esquinas, alineación, títulos y tipografías de partida.
 * El diseño de la página (`design.look` y `design.fonts`, que elige la IA o la persona) tiene la última palabra.
 */
interface TemplateLook {
  radius: NonNullable<PageLook['radius']>;
  align: NonNullable<PageLook['align']>;
  headingWeight: NonNullable<PageLook['headingWeight']>;
  headingCase: NonNullable<PageLook['headingCase']>;
  density: NonNullable<PageLook['density']>;
  fonts: { heading: string; body: string };
}

const LOOKS: Record<TemplateId, TemplateLook> = {
  claridad: { radius: 'md', align: 'left', headingWeight: 700, headingCase: 'normal', density: 'normal', fonts: { heading: 'Montserrat', body: 'Inter' } },
  impacto: { radius: 'none', align: 'left', headingWeight: 800, headingCase: 'upper', density: 'compact', fonts: { heading: 'Oswald', body: 'Open Sans' } },
  minimal: { radius: 'none', align: 'left', headingWeight: 500, headingCase: 'normal', density: 'airy', fonts: { heading: 'Space Grotesk', body: 'Inter' } },
  encuentro: { radius: 'lg', align: 'center', headingWeight: 700, headingCase: 'normal', density: 'normal', fonts: { heading: 'Poppins', body: 'Nunito' } },
  recurso: { radius: 'md', align: 'center', headingWeight: 700, headingCase: 'normal', density: 'normal', fonts: { heading: 'Raleway', body: 'Lato' } },
  agenda: { radius: 'pill', align: 'left', headingWeight: 600, headingCase: 'normal', density: 'normal', fonts: { heading: 'Sora', body: 'DM Sans' } },
};

const RADIUS_PX: Record<NonNullable<PageLook['radius']>, string> = { none: '0px', sm: '6px', md: '12px', lg: '20px', pill: '999px' };
/** El relleno vertical de cada franja, como multiplicador del base. */
const DENSITY_FACTOR: Record<NonNullable<PageLook['density']>, number> = { compact: 0.7, normal: 1, airy: 1.6 };

export interface PageTheme {
  palette: BrandPalette;
  look: {
    /** Esquinas de tarjetas y botones (en CSS). */
    radius: string;
    align: 'left' | 'center';
    headingWeight: number;
    headingTransform: CSSProperties['textTransform'];
    /** Cuánto se multiplica el relleno vertical de las franjas. */
    spacing: number;
  };
  fonts: { heading: string; body: string };
  template: TemplateId;
  /** El fondo de las tarjetas y su borde, según el fondo del bloque donde están. */
  surface: { background: string; border: string };
}

/** La paleta y el estilo de una página: lo que dice su diseño, o los de la plantilla por defecto. */
export function resolveTheme(design: DesignSpec | null | undefined): PageTheme {
  const template = design?.template ?? 'claridad';
  const base = LOOKS[template];
  const palette = design?.palette ?? templateOf(template).palette;
  const own = design?.look ?? {};
  const fonts = design?.fonts && isHeadingFont(design.fonts.heading) && isBodyFont(design.fonts.body) ? design.fonts : base.fonts;
  return {
    template,
    palette,
    fonts,
    look: {
      radius: RADIUS_PX[own.radius ?? base.radius] ?? RADIUS_PX[base.radius],
      align: own.align ?? base.align,
      headingWeight: own.headingWeight ?? base.headingWeight,
      headingTransform: (own.headingCase ?? base.headingCase) === 'upper' ? 'uppercase' : 'none',
      spacing: DENSITY_FACTOR[own.density ?? base.density] ?? 1,
    },
    surface: { background: '#FFFFFF80', border: `${palette.secondary}22` },
  };
}

/** El brillo de un color `#RRGGBB` (0 a 255). */
function brightness(color: string): number {
  const value = Number.parseInt(color.slice(1), 16);
  return 0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
}

/** Un color de la página con el que se ve bien el texto encima (blanco o el texto de la paleta). */
export function readableOn(background: string, palette: BrandPalette): string {
  if (brightness(background) <= 160) return '#FFFFFF';
  // Sobre un fondo claro va el texto de la paleta, salvo que ese texto también sea claro (franjas de color u oscuras).
  return brightness(palette.text) < 128 ? palette.text : '#17161C';
}

export interface Tone {
  /** El fondo de la franja (`null`: el de la página). */
  background: string | null;
  /** El tema con el que se dibujan los bloques sobre ese fondo (colores de texto, acentos y tarjetas ajustados). */
  theme: PageTheme;
  /** El color del texto sobre ese fondo (`null`: el de la página). */
  color: string | null;
}

/** El fondo de la franja de un bloque y el tema con el que se ve bien encima. */
export function toneOf(theme: PageTheme, background: BlockBackground): Tone {
  const { palette } = theme;
  if (background === 'base') return { background: null, theme, color: null };
  if (background === 'alt') return { background: `${palette.secondary}14`, theme, color: null };

  const bg = background === 'accent' ? palette.primary : brightness(palette.text) < 90 ? palette.text : '#17161C';
  const fg = readableOn(bg, palette);
  // Los acentos (botones, números, íconos) deben distinguirse del fondo: sobre una franja de color, el texto; sobre oscuro, la marca si es clara.
  const mark = background === 'accent' ? fg : brightness(palette.primary) > 110 ? palette.primary : brightness(palette.accent) > 110 ? palette.accent : '#FFFFFF';
  const toned: PageTheme = {
    ...theme,
    palette: { ...palette, background: bg, text: fg, primary: mark, accent: mark, secondary: fg },
    surface: { background: fg === '#FFFFFF' ? '#FFFFFF1F' : '#FFFFFF99', border: `${fg}33` },
  };
  return { background: bg, theme: toned, color: fg };
}

/** La dirección de Google Fonts de las dos tipografías de una página (solo nombres del catálogo, ya validados). */
export function fontsHref(fonts: { heading: string; body: string }): string {
  const family = (name: string, weights: string) => `family=${name.replace(/ /g, '+')}:wght@${weights}`;
  return `https://fonts.googleapis.com/css2?${family(fonts.heading, '500;600;700;800')}&${family(fonts.body, '400;600')}&display=swap`;
}
