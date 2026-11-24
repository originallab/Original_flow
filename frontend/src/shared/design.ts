import type { BlockType } from '@/shared/blocks/types';

/**
 * El catálogo de diseño de una página: las mismas opciones que acepta el backend (`funnel-types/design.ts`).
 * Todo es un conjunto cerrado: el renderizador sabe dibujar cada una y lo que no esté aquí se ignora.
 */

export const HEADING_FONTS = [
  'Poppins', 'Montserrat', 'Playfair Display', 'DM Serif Display', 'Space Grotesk', 'Raleway', 'Oswald', 'Lora', 'Sora', 'Fraunces',
  'Cormorant Garamond', 'Libre Baskerville', 'Syne', 'Unbounded', 'Bitter', 'Merriweather', 'Rubik', 'Manrope', 'Outfit', 'Plus Jakarta Sans',
  'Josefin Sans', 'Bricolage Grotesque', 'Epilogue', 'Lexend', 'Urbanist', 'Spectral', 'Crimson Pro', 'Zilla Slab',
  'Orbitron', 'Rajdhani', 'Exo 2', 'Chakra Petch', 'Cinzel', 'Fredoka', 'Baloo 2', 'Caveat', 'Dancing Script', 'Space Mono',
  'Bebas Neue', 'Abril Fatface', 'Anton', 'Archivo Black', 'Gloock', 'Prata', 'Young Serif', 'Instrument Serif',
  'Audiowide', 'Russo One', 'Press Start 2P', 'Bungee', 'Pacifico', 'Righteous', 'Marcellus', 'Alfa Slab One',
] as const;
export const BODY_FONTS = [
  'Inter', 'Open Sans', 'Lato', 'Source Sans 3', 'Nunito', 'DM Sans', 'Work Sans', 'Manrope', 'Outfit', 'Plus Jakarta Sans', 'Rubik', 'Karla',
  'Mulish', 'IBM Plex Sans', 'Figtree', 'Libre Franklin', 'PT Sans', 'Cabin', 'Quicksand', 'Lora', 'Merriweather', 'Spectral', 'Crimson Pro',
] as const;

/** Tipografías de un solo grosor (solo el normal): se piden sin pesos a Google Fonts y sus títulos no se «engrosan». */
export const SINGLE_WEIGHT_FONTS: readonly string[] = ['DM Serif Display', 'Bebas Neue', 'Abril Fatface', 'Anton', 'Archivo Black', 'Gloock', 'Prata', 'Young Serif', 'Instrument Serif', 'Audiowide', 'Russo One', 'Press Start 2P', 'Bungee', 'Pacifico', 'Righteous', 'Marcellus', 'Alfa Slab One'];

export const RADII = ['none', 'sm', 'md', 'lg', 'pill'] as const;
export const DENSITIES = ['compact', 'normal', 'airy'] as const;
export const ALIGNS = ['left', 'center'] as const;
export const HEADING_CASES = ['normal', 'upper'] as const;
export const HEADING_WEIGHTS = [500, 600, 700, 800] as const;
/** Cómo se dibujan las tarjetas: planas, con borde, con sombra, de vidrio o con brillo de neón. */
export const SURFACES = ['flat', 'outline', 'elevated', 'glass', 'glow'] as const;
/** Efecto de los títulos: ninguno, degradado, brillo o subrayado de color. */
export const EFFECTS = ['none', 'gradient', 'glow', 'underline'] as const;
/** Decoración detrás de toda la página: lisa, degradado suave, cuadrícula, puntos o resplandor. */
export const BACKDROPS = ['plain', 'gradient', 'grid', 'dots', 'glow'] as const;
/** Corte entre franjas de color: recto, en diagonal, ondulado o en zigzag. */
export const DIVIDERS = ['none', 'slant', 'wave', 'zigzag'] as const;
/** Botones: sólidos, con degradado o con brillo. */
export const BUTTONS = ['solid', 'gradient', 'glow'] as const;
/** Cómo se acomoda el patrón de fondo que sube la persona: en mosaico o cubriendo toda la página. */
export const PATTERN_MODES = ['tile', 'cover'] as const;
/** Tamaño de cada repetición del mosaico. */
export const PATTERN_SCALES = ['sm', 'md', 'lg'] as const;
/** Cuánto se atenúa el patrón con el color de fondo (en %), para que el texto se siga leyendo. */
export const PATTERN_DIMS = [0, 25, 50, 75] as const;
export type PatternMode = (typeof PATTERN_MODES)[number];
export type PatternScale = (typeof PATTERN_SCALES)[number];
export type PatternDim = (typeof PATTERN_DIMS)[number];

export interface PageLook {
  radius?: (typeof RADII)[number];
  density?: (typeof DENSITIES)[number];
  align?: (typeof ALIGNS)[number];
  headingCase?: (typeof HEADING_CASES)[number];
  headingWeight?: (typeof HEADING_WEIGHTS)[number];
  surface?: (typeof SURFACES)[number];
  effect?: (typeof EFFECTS)[number];
  backdrop?: (typeof BACKDROPS)[number];
  divider?: (typeof DIVIDERS)[number];
  button?: (typeof BUTTONS)[number];
}

/** Íconos que puede llevar cada beneficio (nombres de la biblioteca de íconos del front). */
export const ICONS = [
  'zap', 'shield-check', 'star', 'heart', 'rocket', 'trophy', 'target', 'users', 'clock', 'circle-check', 'sparkles', 'globe',
  'lock', 'gift', 'flame', 'gem', 'lightbulb', 'chart-line', 'award', 'headphones', 'gamepad-2', 'map-pin', 'calendar', 'book-open',
  'camera', 'music', 'leaf', 'coffee', 'dumbbell', 'wallet', 'smile', 'handshake', 'truck', 'wrench', 'sun', 'brain', 'swords', 'crown', 'palette', 'code',
] as const;
export type IconName = (typeof ICONS)[number];

export const BACKGROUNDS = ['base', 'alt', 'accent', 'dark', 'gradient', 'mesh'] as const;
export type BlockBackground = (typeof BACKGROUNDS)[number];

export const BACKGROUND_LABELS: Record<BlockBackground, string> = { base: 'El de la página', alt: 'Suave', accent: 'Color de la marca', dark: 'Oscuro', gradient: 'Degradado', mesh: 'Malla de color' };

/** Las formas de dibujar cada tipo de bloque. La primera es la que se usa si no se elige ninguna. */
export const BLOCK_VARIANTS: Partial<Record<BlockType, readonly string[]>> = {
  encabezado: ['centrado', 'izquierda', 'dividido', 'grande', 'pancarta', 'acento', 'editorial'],
  texto: ['normal', 'destacado', 'cita'],
  beneficios: ['tarjetas', 'lista', 'numerados', 'columnas', 'iconos', 'alternado', 'chips'],
  faq: ['abierto', 'tarjetas', 'compacto', 'columnas'],
  precios: ['tarjetas', 'simple', 'destacado'],
  boton: ['solido', 'contorno', 'banda'],
};

export const VARIANT_LABELS: Record<string, string> = {
  centrado: 'Centrado',
  izquierda: 'A la izquierda',
  dividido: 'Dividido',
  grande: 'Grande',
  normal: 'Normal',
  destacado: 'Destacado',
  tarjetas: 'Tarjetas',
  lista: 'Lista',
  numerados: 'Numerados',
  columnas: 'Columnas',
  abierto: 'Abierto',
  compacto: 'Compacto',
  simple: 'Simple',
  solido: 'Sólido',
  contorno: 'Contorno',
  banda: 'Banda',
  pancarta: 'Pancarta',
  acento: 'Con acento',
  editorial: 'Editorial',
  cita: 'Cita',
  iconos: 'Íconos grandes',
  alternado: 'Alternado',
  chips: 'Etiquetas',
};

const includes = (list: readonly string[], value: unknown): value is string => typeof value === 'string' && list.includes(value);

/** La variante elegida de un bloque, solo si es una del catálogo para su tipo. */
export function variantOf(type: BlockType, style: Record<string, unknown> | undefined): string | undefined {
  const value = style?.variant;
  return includes(BLOCK_VARIANTS[type] ?? [], value) ? value : undefined;
}

/** El fondo elegido de un bloque, solo si es uno del catálogo. */
export function backgroundOf(style: Record<string, unknown> | undefined): BlockBackground {
  const value = style?.background;
  return includes(BACKGROUNDS, value) ? (value as BlockBackground) : 'base';
}

export const isHeadingFont = (value: unknown): value is (typeof HEADING_FONTS)[number] => includes(HEADING_FONTS, value);
export const isBodyFont = (value: unknown): value is (typeof BODY_FONTS)[number] => includes(BODY_FONTS, value);
