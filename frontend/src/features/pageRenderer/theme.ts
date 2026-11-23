import type { CSSProperties } from 'react';
import { templateOf } from '@/features/funnels/catalog';
import type { BrandPalette } from '@/services/workspaces';
import type { DesignSpec, TemplateId } from '@/shared/blocks/types';
import { safeHttpUrl } from '@/shared/utils/safeUrl';
import { isBodyFont, isHeadingFont, SINGLE_WEIGHT_FONTS, type BlockBackground, type PageLook, type PatternDim, type PatternMode, type PatternScale } from '@/shared/design';

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

/** Cómo se dibujan las tarjetas sobre el fondo donde están. */
export interface Surface {
  background: string;
  border: string;
  shadow?: string;
  /** Desenfoque del fondo (vidrio). */
  blur?: string;
}

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
    /** Estilo de las tarjetas (`undefined`: el de siempre). */
    surfaceKind?: NonNullable<PageLook['surface']>;
    effect: NonNullable<PageLook['effect']>;
    backdrop: NonNullable<PageLook['backdrop']>;
    divider: NonNullable<PageLook['divider']>;
    button: NonNullable<PageLook['button']>;
  };
  /** El patrón de fondo de la página, si lo tiene y su dirección es válida. */
  pattern?: { url: string; mode: PatternMode; scale: PatternScale; dim: PatternDim };
  fonts: { heading: string; body: string };
  template: TemplateId;
  /** El fondo de las tarjetas y su borde, según el estilo elegido y el fondo del bloque donde están. */
  surface: Surface;
}

/** Las tarjetas según su estilo; `ink` es el color del texto y `mark` el de la marca; `onDark` dice si el fondo es oscuro. */
function surfaceFor(kind: PageLook['surface'] | undefined, ink: string, mark: string, onDark: boolean, secondary: string): Surface {
  switch (kind) {
    case 'flat':
      return { background: onDark ? '#FFFFFF14' : `${ink}0D`, border: 'transparent' };
    case 'outline':
      return { background: 'transparent', border: onDark ? '#FFFFFF55' : `${ink}55` };
    case 'elevated':
      return { background: onDark ? '#FFFFFF12' : '#FFFFFFCC', border: onDark ? '#FFFFFF1F' : `${ink}12`, shadow: onDark ? '0 10px 30px #00000066' : '0 12px 32px #00000024' };
    case 'glass':
      return { background: onDark ? '#FFFFFF1F' : '#FFFFFF73', border: onDark ? '#FFFFFF3D' : '#FFFFFFB3', shadow: onDark ? '0 8px 32px #00000055' : '0 8px 28px #0000001A', blur: '14px' };
    case 'glow':
      return { background: onDark ? '#FFFFFF0A' : '#FFFFFFB3', border: mark, shadow: `0 0 22px ${mark}66` };
    default:
      // El de siempre: velo tenue sobre fondos oscuros y blanco translúcido sobre claros.
      return onDark ? { background: '#FFFFFF14', border: '#FFFFFF2E' } : { background: '#FFFFFF80', border: `${secondary}22` };
  }
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
      // Las tipografías de un solo grosor no se «engrosan» (se verían falsas).
      headingWeight: SINGLE_WEIGHT_FONTS.includes(fonts.heading) ? 400 : (own.headingWeight ?? base.headingWeight),
      headingTransform: (own.headingCase ?? base.headingCase) === 'upper' ? 'uppercase' : 'none',
      spacing: DENSITY_FACTOR[own.density ?? base.density] ?? 1,
      surfaceKind: own.surface,
      effect: own.effect ?? 'none',
      backdrop: own.backdrop ?? 'plain',
      divider: own.divider ?? 'none',
      button: own.button ?? 'solid',
    },
    pattern: patternOf(design),
    surface: surfaceFor(own.surface, palette.text, palette.primary, brightness(palette.background) < 110, palette.secondary),
  };
}

/** El patrón de fondo del diseño, solo si su dirección es una http(s) válida. */
function patternOf(design: DesignSpec | null | undefined): PageTheme['pattern'] {
  const p = design?.pattern;
  const url = safeHttpUrl(p?.url);
  return p && url ? { url, mode: p.mode, scale: p.scale, dim: p.dim } : undefined;
}

/** El brillo de un color `#RRGGBB` (0 a 255). */
function brightness(color: string): number {
  const value = Number.parseInt(color.slice(1), 16);
  return 0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
}

/** El segundo color de un degradado: el de acento si se distingue del fondo y, si no, el secundario. */
function secondStop(palette: BrandPalette): string {
  return Math.abs(brightness(palette.accent) - brightness(palette.background)) > 60 ? palette.accent : palette.secondary;
}

/** El estilo de los títulos: grosor, mayúsculas y el efecto que eligió la página (degradado, brillo o subrayado). */
export function headingStyle(theme: PageTheme): CSSProperties {
  const { palette, look } = theme;
  const base: CSSProperties = { fontWeight: look.headingWeight, textTransform: look.headingTransform };
  if (look.effect === 'gradient') return { ...base, backgroundImage: `linear-gradient(90deg, ${palette.primary}, ${secondStop(palette)})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent' };
  if (look.effect === 'glow') return { ...base, textShadow: `0 0 22px ${palette.primary}AA, 0 0 3px ${palette.primary}66` };
  if (look.effect === 'underline') return { ...base, textDecoration: 'underline', textDecorationColor: palette.primary, textDecorationThickness: '0.12em', textUnderlineOffset: '0.2em' };
  return base;
}

const PATTERN_PX: Record<PatternScale, number> = { sm: 120, md: 200, lg: 320 };

/** La decoración detrás de toda la página: el patrón que subió la persona (atenuado) y, encima, cuadrícula, puntos, degradado o resplandor. */
export function backdropStyle(theme: PageTheme): CSSProperties {
  const { palette, look, pattern } = theme;
  // Capas de arriba hacia abajo: decoración, velo del color de fondo y patrón.
  const images: string[] = [];
  const sizes: string[] = [];
  const repeats: string[] = [];
  const attachments: string[] = [];
  const layer = (image: string, size = 'auto', repeat = 'repeat', attachment = 'scroll') => {
    images.push(image);
    sizes.push(size);
    repeats.push(repeat);
    attachments.push(attachment);
  };
  switch (look.backdrop) {
    case 'grid':
      layer(`linear-gradient(${palette.text}14 1px, transparent 1px)`, '36px 36px');
      layer(`linear-gradient(90deg, ${palette.text}14 1px, transparent 1px)`, '36px 36px');
      break;
    case 'dots':
      layer(`radial-gradient(${palette.text}26 1.2px, transparent 1.2px)`, '22px 22px');
      break;
    case 'gradient':
      layer(`linear-gradient(165deg, ${palette.background} 0%, ${palette.primary}26 100%)`);
      break;
    case 'glow':
      layer(`radial-gradient(ellipse 70% 40% at 15% 0%, ${palette.primary}44, transparent 70%)`);
      layer(`radial-gradient(ellipse 60% 35% at 92% 30%, ${secondStop(palette)}33, transparent 70%)`);
      break;
    default:
      break;
  }
  if (pattern) {
    if (pattern.dim > 0) {
      const veil = `${palette.background}${Math.round((pattern.dim / 100) * 255).toString(16).padStart(2, '0')}`;
      layer(`linear-gradient(${veil}, ${veil})`);
    }
    // La dirección ya viene normalizada: solo se escapa lo que podría cerrar el `url()`.
    const href = `url("${pattern.url.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;
    // «Cubrir» estira la imagen para llenar la página; «mosaico» la repite.
    if (pattern.mode === 'cover') layer(href, 'cover', 'no-repeat', 'scroll');
    else layer(href, `${PATTERN_PX[pattern.scale]}px auto`);
  }
  if (images.length === 0) return {};
  return { backgroundImage: images.join(', '), backgroundSize: sizes.join(', '), backgroundRepeat: repeats.join(', '), backgroundAttachment: attachments.join(', '), backgroundPosition: pattern?.mode === 'cover' ? 'center' : '0 0' };
}

/** El relleno de los botones principales según el estilo de la página (sólido, degradado o con brillo). */
export function buttonFill(theme: PageTheme): CSSProperties {
  const { palette, look } = theme;
  const color = readableOn(palette.primary, palette);
  if (look.button === 'gradient') return { background: `linear-gradient(135deg, ${palette.primary}, ${secondStop(palette)})`, color };
  if (look.button === 'glow') return { background: palette.primary, color, boxShadow: `0 0 24px ${palette.primary}99` };
  return { background: palette.primary, color };
}

/** Un color de la página con el que se ve bien el texto encima (blanco o el texto de la paleta). */
export function readableOn(background: string, palette: BrandPalette): string {
  if (brightness(background) <= 160) return '#FFFFFF';
  // Sobre un fondo claro va el texto de la paleta, salvo que ese texto también sea claro (franjas de color u oscuras).
  return brightness(palette.text) < 128 ? palette.text : '#17161C';
}

export interface Tone {
  /** El fondo de la franja, como valor de `background` (puede tener varias capas); `null`: el de la página. */
  background: string | null;
  /** Sombras de color a los lados para que la franja llene todo el ancho en la página publicada (`null` si no tiene color). */
  bleed: string | null;
  /** El tema con el que se dibujan los bloques sobre ese fondo (colores de texto, acentos y tarjetas ajustados). */
  theme: PageTheme;
  /** El color del texto sobre ese fondo (`null`: el de la página). */
  color: string | null;
}

/** Mezcla dos colores `#RRGGBB` (`t` de 0 a 1). */
function mix(a: string, b: string, t: number): string {
  const [x, y] = [Number.parseInt(a.slice(1), 16), Number.parseInt(b.slice(1), 16)];
  const ch = (shift: number) => Math.round(((x >> shift) & 255) * (1 - t) + ((y >> shift) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

const solidBleed = (color: string) => `0 0 0 100vmax ${color}`;

/** El fondo de la franja de un bloque y el tema con el que se ve bien encima. */
export function toneOf(theme: PageTheme, background: BlockBackground): Tone {
  const { palette } = theme;
  if (background === 'base') return { background: null, bleed: null, theme, color: null };
  if (background === 'alt') return { background: `${palette.secondary}14`, bleed: solidBleed(`${palette.secondary}14`), theme, color: null };

  const darkBase = brightness(palette.text) < 90 ? palette.text : '#17161C';
  const lightMark = brightness(palette.primary) > 110 ? palette.primary : brightness(palette.accent) > 110 ? palette.accent : '#FFFFFF';
  const stop2 = secondStop(palette);
  // El degradado va de la marca a un segundo color; si son muy distintos en brillo, se acerca para que el texto se lea en toda la franja.
  const end = Math.abs(brightness(palette.primary) - brightness(stop2)) > 90 ? mix(palette.primary, stop2, 0.5) : stop2;

  let bg: string;
  let fill: string;
  let bleed: string;
  let mark: string;
  if (background === 'accent') {
    bg = palette.primary;
    fill = `linear-gradient(135deg, #FFFFFF26 0%, transparent 55%), ${bg}`;
    bleed = solidBleed(bg);
    mark = readableOn(bg, palette);
  } else if (background === 'gradient') {
    bg = mix(palette.primary, end, 0.5);
    fill = `radial-gradient(circle at 88% 0%, #FFFFFF2E, transparent 50%), linear-gradient(90deg, ${palette.primary}, ${end})`;
    // Dos sombras (una por lado) con el color de cada extremo del degradado, para que la franja siga hasta los bordes de la pantalla.
    bleed = `50vmax 0 0 50vmax ${end}, -50vmax 0 0 50vmax ${palette.primary}`;
    mark = readableOn(bg, palette);
  } else if (background === 'mesh') {
    bg = darkBase;
    fill = `radial-gradient(circle at 14% 18%, ${palette.primary}66, transparent 46%), radial-gradient(circle at 86% 82%, ${stop2}55, transparent 46%), radial-gradient(circle at 72% 8%, ${palette.accent}3D, transparent 40%), ${bg}`;
    bleed = solidBleed(bg);
    mark = lightMark;
  } else {
    bg = darkBase;
    fill = `radial-gradient(ellipse 55% 90% at 86% 0%, ${lightMark}33, transparent 70%), ${bg}`;
    bleed = solidBleed(bg);
    mark = lightMark;
  }
  const fg = readableOn(bg, palette);
  const accentMark = background === 'accent' || background === 'gradient' ? fg : mark;
  const toned: PageTheme = {
    ...theme,
    palette: { ...palette, background: bg, text: fg, primary: accentMark, accent: accentMark, secondary: fg },
    surface: theme.look.surfaceKind ? surfaceFor(theme.look.surfaceKind, fg, accentMark, fg === '#FFFFFF', fg) : { background: fg === '#FFFFFF' ? '#FFFFFF1F' : '#FFFFFF99', border: `${fg}33` },
  };
  return { background: fill, bleed, theme: toned, color: fg };
}

const CUT_REM = 2.5;

/**
 * El recorte del borde de abajo de una franja de color: en diagonal, ondulado o en zigzag. En la página publicada la franja
 * sigue hasta los bordes de la pantalla (`wide`). Devuelve el recorte y el relleno extra de abajo para que el contenido no se corte.
 */
export function dividerClip(kind: PageLook['divider'] | undefined, wide: boolean): { clipPath: string; paddingBottom: string } | null {
  if (!kind || kind === 'none') return null;
  // Puntos de abajo, de izquierda a derecha: [posición horizontal en %, profundidad de 0 a 1].
  const bottom: [number, number][] = [];
  if (kind === 'slant') bottom.push([0, 0], [100, 1]);
  else if (kind === 'wave') for (let i = 0; i <= 60; i += 1) bottom.push([(i / 60) * 100, 0.5 + 0.5 * Math.sin((i / 60) * Math.PI * 6)]);
  else for (let i = 0; i <= 16; i += 1) bottom.push([(i / 16) * 100, i % 2]);
  const left = wide ? '-100vmax' : '0';
  const right = wide ? 'calc(100% + 100vmax)' : '100%';
  const y = (depth: number) => `calc(100% - ${(CUT_REM * depth).toFixed(3)}rem)`;
  const x = (pct: number, first: boolean, last: boolean) => (first ? left : last ? right : `${pct.toFixed(2)}%`);
  const points = [`${left} 0`, `${right} 0`, ...[...bottom].reverse().map(([pct, depth], i, all) => `${x(pct, i === all.length - 1, i === 0)} ${y(depth)}`)];
  return { clipPath: `polygon(${points.join(', ')})`, paddingBottom: `${CUT_REM}rem` };
}

/** La dirección de Google Fonts de las dos tipografías de una página (solo nombres del catálogo, ya validados). */
export function fontsHref(fonts: { heading: string; body: string }): string {
  const name = (font: string) => font.replace(/ /g, '+');
  // Google Fonts rechaza toda la petición si se pide un peso que la tipografía no tiene: las de un solo grosor van sin pesos.
  const heading = SINGLE_WEIGHT_FONTS.includes(fonts.heading) ? name(fonts.heading) : `${name(fonts.heading)}:wght@500;600;700;800`;
  return `https://fonts.googleapis.com/css2?family=${heading}&family=${name(fonts.body)}:wght@400;600&display=swap`;
}
