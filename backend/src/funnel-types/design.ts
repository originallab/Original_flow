import type { BlockType } from './blocks.js';

/**
 * El catálogo de diseño de una página: lo que la IA (y la persona) pueden elegir además de la plantilla y la paleta.
 * Todo es un conjunto cerrado de opciones: el front sabe dibujar cada una y el backend descarta lo que no esté aquí,
 * así una respuesta de la IA nunca puede meter estilos arbitrarios. La misma lista vive en el front (`shared/design.ts`).
 */

/** Tipografías de títulos y de texto (Google Fonts). */
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

/** El aspecto general de la página (se suma a la plantilla). */
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

/** El fondo de la franja de un bloque: el de la página, uno suave, el color de la marca, uno oscuro, un degradado o una malla de color. */
/** Íconos que puede llevar cada beneficio (nombres de la biblioteca de íconos del front). */
export const ICONS = [
  'zap', 'shield-check', 'star', 'heart', 'rocket', 'trophy', 'target', 'users', 'clock', 'circle-check', 'sparkles', 'globe',
  'lock', 'gift', 'flame', 'gem', 'lightbulb', 'chart-line', 'award', 'headphones', 'gamepad-2', 'map-pin', 'calendar', 'book-open',
  'camera', 'music', 'leaf', 'coffee', 'dumbbell', 'wallet', 'smile', 'handshake', 'truck', 'wrench', 'sun', 'brain', 'swords', 'crown', 'palette', 'code',
] as const;
export type IconName = (typeof ICONS)[number];

export const BACKGROUNDS = ['base', 'alt', 'accent', 'dark', 'gradient', 'mesh'] as const;
export type BlockBackground = (typeof BACKGROUNDS)[number];

/** Las formas de dibujar cada tipo de bloque (`style.variant`). El primero es el que se usa si no se elige ninguna. */
export const BLOCK_VARIANTS: Partial<Record<BlockType, readonly string[]>> = {
  encabezado: ['centrado', 'izquierda', 'dividido', 'grande'],
  texto: ['normal', 'destacado'],
  beneficios: ['tarjetas', 'lista', 'numerados', 'columnas'],
  faq: ['abierto', 'tarjetas', 'compacto'],
  precios: ['tarjetas', 'simple'],
  boton: ['solido', 'contorno', 'banda'],
};

/** Deja solo lo permitido en el `style` de un bloque (variante de su tipo y fondo); lo demás se descarta. */
export function sanitizeBlockStyle(type: BlockType, style: Record<string, unknown> | undefined): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  const variant = style?.variant;
  if (typeof variant === 'string' && BLOCK_VARIANTS[type]?.includes(variant)) clean.variant = variant;
  const background = style?.background;
  if (typeof background === 'string' && (BACKGROUNDS as readonly string[]).includes(background)) clean.background = background;
  return clean;
}

const pick = <T extends string | number>(value: unknown, allowed: readonly T[]): T | undefined => (allowed as readonly unknown[]).includes(value) ? (value as T) : undefined;

/** Del aspecto que propone la IA se queda solo con lo permitido (cada campo inválido se descarta, no tumba la página). */
export function sanitizeLook(raw: unknown): PageLook | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const look: PageLook = {};
  const radius = pick(r.radius, RADII);
  const density = pick(r.density, DENSITIES);
  const align = pick(r.align, ALIGNS);
  const headingCase = pick(r.headingCase, HEADING_CASES);
  const headingWeight = pick(r.headingWeight, HEADING_WEIGHTS);
  const surface = pick(r.surface, SURFACES);
  const effect = pick(r.effect, EFFECTS);
  const backdrop = pick(r.backdrop, BACKDROPS);
  const divider = pick(r.divider, DIVIDERS);
  const button = pick(r.button, BUTTONS);
  if (radius) look.radius = radius;
  if (density) look.density = density;
  if (align) look.align = align;
  if (headingCase) look.headingCase = headingCase;
  if (headingWeight) look.headingWeight = headingWeight;
  if (surface) look.surface = surface;
  if (effect) look.effect = effect;
  if (backdrop) look.backdrop = backdrop;
  if (divider) look.divider = divider;
  if (button) look.button = button;
  return Object.keys(look).length > 0 ? look : undefined;
}

/** Las tipografías solo valen las del catálogo, y siempre las dos juntas. */
export function sanitizeFonts(raw: unknown): { heading: string; body: string } | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const heading = pick(r.heading, HEADING_FONTS);
  const body = pick(r.body, BODY_FONTS);
  return heading && body ? { heading, body } : undefined;
}

/** Limpia el `designSpec` de la propuesta de la IA (tipografías y aspecto); la plantilla y la paleta las valida el esquema. */
export function cleanProposalDesign(proposal: unknown): unknown {
  if (proposal === null || typeof proposal !== 'object') return proposal;
  const page = proposal as { designSpec?: unknown };
  if (page.designSpec === null || typeof page.designSpec !== 'object') return proposal;
  const { fonts, look, ...rest } = page.designSpec as Record<string, unknown>;
  const cleanFonts = sanitizeFonts(fonts);
  const cleanLook = sanitizeLook(look);
  return { ...(proposal as object), designSpec: { ...rest, ...(cleanFonts ? { fonts: cleanFonts } : {}), ...(cleanLook ? { look: cleanLook } : {}) } };
}

/** Íconos con los que se completan los beneficios que la IA dejó sin ícono (genéricos, valen para cualquier tema). */
const ICON_POOL: readonly (typeof ICONS)[number][] = ['sparkles', 'circle-check', 'zap', 'target', 'star', 'shield-check', 'lightbulb', 'heart', 'rocket', 'award', 'users', 'clock'];

/** Cada beneficio lleva un ícono: a los que no tienen se les da uno genérico (sin repetir dentro del mismo bloque mientras alcance). */
export function fillIcons(type: BlockType, content: Record<string, unknown>, offset: number): Record<string, unknown> {
  if (type !== 'beneficios' || !Array.isArray(content.items)) return content;
  const used = new Set(content.items.map((i) => (i as { icon?: unknown } | null)?.icon).filter((i): i is string => typeof i === 'string'));
  let next = offset;
  const items = content.items.map((item) => {
    if (item === null || typeof item !== 'object' || typeof (item as { icon?: unknown }).icon === 'string') return item;
    let icon = ICON_POOL[next % ICON_POOL.length] as string;
    for (let tries = 0; tries < ICON_POOL.length && used.has(icon); tries += 1) {
      next += 1;
      icon = ICON_POOL[next % ICON_POOL.length] as string;
    }
    next += 1;
    used.add(icon);
    return { ...(item as Record<string, unknown>), icon };
  });
  return { ...content, items };
}

/** En los beneficios, el ícono de cada elemento solo vale si es del catálogo; si no, se quita (el resto del bloque no cambia). */
export function cleanIcons(type: BlockType, content: Record<string, unknown>): Record<string, unknown> {
  if (type !== 'beneficios' || !Array.isArray(content.items)) return content;
  const items = content.items.map((item) => {
    if (item === null || typeof item !== 'object') return item;
    const { icon, ...rest } = item as Record<string, unknown>;
    return typeof icon === 'string' && (ICONS as readonly string[]).includes(icon) ? { ...rest, icon } : rest;
  });
  return { ...content, items };
}
