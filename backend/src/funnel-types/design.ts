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
  'Bebas Neue', 'Abril Fatface', 'Anton', 'Archivo Black', 'Gloock', 'Prata', 'Young Serif', 'Instrument Serif',
] as const;
export const BODY_FONTS = [
  'Inter', 'Open Sans', 'Lato', 'Source Sans 3', 'Nunito', 'DM Sans', 'Work Sans', 'Manrope', 'Outfit', 'Plus Jakarta Sans', 'Rubik', 'Karla',
  'Mulish', 'IBM Plex Sans', 'Figtree', 'Libre Franklin', 'PT Sans', 'Cabin', 'Quicksand', 'Lora', 'Merriweather', 'Spectral', 'Crimson Pro',
] as const;

/** Tipografías de un solo grosor (solo el normal): se piden sin pesos a Google Fonts y sus títulos no se «engrosan». */
export const SINGLE_WEIGHT_FONTS: readonly string[] = ['DM Serif Display', 'Bebas Neue', 'Abril Fatface', 'Anton', 'Archivo Black', 'Gloock', 'Prata', 'Young Serif', 'Instrument Serif'];

export const RADII = ['none', 'sm', 'md', 'lg', 'pill'] as const;
export const DENSITIES = ['compact', 'normal', 'airy'] as const;
export const ALIGNS = ['left', 'center'] as const;
export const HEADING_CASES = ['normal', 'upper'] as const;
export const HEADING_WEIGHTS = [500, 600, 700, 800] as const;

/** El aspecto general de la página (se suma a la plantilla). */
export interface PageLook {
  radius?: (typeof RADII)[number];
  density?: (typeof DENSITIES)[number];
  align?: (typeof ALIGNS)[number];
  headingCase?: (typeof HEADING_CASES)[number];
  headingWeight?: (typeof HEADING_WEIGHTS)[number];
}

/** El fondo de la franja de un bloque: el de la página, uno suave, el color de la marca o uno oscuro. */
export const BACKGROUNDS = ['base', 'alt', 'accent', 'dark'] as const;
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
  if (radius) look.radius = radius;
  if (density) look.density = density;
  if (align) look.align = align;
  if (headingCase) look.headingCase = headingCase;
  if (headingWeight) look.headingWeight = headingWeight;
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
