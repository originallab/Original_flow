import type { BlockType } from './blocks.js';
import { BACKGROUNDS, BLOCK_VARIANTS, sanitizeBlockStyle, type BlockBackground, type PageLook } from './design.js';
import { DIRECTIONS, hash, type Direction, type Palette } from './directions.js';

/**
 * Pasada de calidad sobre una página generada: el diseño sale de la dirección elegida, y el estilo de cada bloque
 * (forma y fondo) se completa y se corrige con reglas fijas, sin depender de que la IA acierte con la estética:
 * ritmo de fondos (nunca dos franjas fuertes seguidas ni demasiadas), formas distintas entre bloques parecidos y colores
 * que se leen. Lo que la IA ya eligió bien se respeta.
 */

export interface PolishBlock {
  type: BlockType;
  order: number;
  style: Record<string, unknown>;
}

/** Las franjas con color propio (llamativas): no van dos seguidas ni más de una de cada tres. */
const STRONG: readonly BlockBackground[] = ['accent', 'dark', 'gradient', 'mesh'];
const isBackground = (value: unknown): value is BlockBackground => typeof value === 'string' && (BACKGROUNDS as readonly string[]).includes(value);

/** El brillo relativo de un color `#RRGGBB` (0 a 1), como lo define WCAG. */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((value >> 16) & 255) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255);
}

/** La relación de contraste entre dos colores (1 a 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** ¿Se lee el texto sobre el fondo, y el color de la marca se distingue del fondo? */
export function paletteReads(p: Palette): boolean {
  return contrast(p.text, p.background) >= 4.5 && contrast(p.primary, p.background) >= 3;
}

const toRgb = (hex: string): [number, number, number] => {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Acerca un color a negro o a blanco (según el fondo) hasta que se distinga lo necesario del fondo. */
function pushAway(color: string, background: string, min: number): string {
  const target = luminance(background) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  const from = toRgb(color);
  for (let step = 0; step <= 20; step += 1) {
    const t = step / 20;
    const candidate = toHex(from.map((c, i) => c + ((target[i] as number) - c) * t));
    if (contrast(candidate, background) >= min) return candidate;
  }
  return toHex(target);
}

/** Corrige una paleta que propuso la IA para que el texto se lea y el color principal se distinga del fondo (conserva su carácter). */
export function repairPalette(p: Palette): Palette {
  return { ...p, text: pushAway(p.text, p.background, 7), primary: pushAway(p.primary, p.background, 3), secondary: pushAway(p.secondary, p.background, 3) };
}

/**
 * La paleta de la página: la de la marca si la tiene (es suya y no se toca); si no, la que propuso la IA (corregida si no se
 * leía bien); y si no propuso ninguna, una de respaldo.
 */
export function pickPalette(fallback: Palette, brand?: Palette, proposed?: Palette): Palette {
  if (brand) return brand;
  if (proposed) return paletteReads(proposed) ? proposed : repairPalette(proposed);
  return fallback;
}

/** Cómo se completa el estilo de los bloques en los que la IA no eligió forma o fondo. */
export interface StyleHints {
  hero: { variant?: string; background?: BlockBackground };
  variants: Partial<Record<BlockType, string>>;
  bands: BlockBackground[];
}

/** Pistas al azar (pero estables para una semilla): lo que no decide la IA tampoco sale siempre igual. */
export function randomHints(seed: string): StyleHints {
  const choose = <T>(list: readonly T[], salt: string): T => list[hash(`${salt}:${seed}`) % list.length] as T;
  const variants: Partial<Record<BlockType, string>> = {};
  for (const [type, options] of Object.entries(BLOCK_VARIANTS)) if (options) variants[type as BlockType] = choose(options, type);
  const strong = choose<BlockBackground>(['accent', 'dark', 'gradient', 'mesh'], 'strong');
  const cycles: BlockBackground[][] = [
    ['base', 'alt', 'base', strong],
    ['alt', 'base', strong, 'base'],
    ['base', strong, 'base', 'alt'],
    ['base', 'alt', strong, 'base', 'alt'],
  ];
  return {
    hero: { variant: choose(BLOCK_VARIANTS.encabezado ?? ['centrado'], 'hero'), background: choose<BlockBackground>(['dark', 'gradient', 'mesh', 'accent', 'gradient', 'mesh'], 'herobg') },
    variants,
    bands: choose(cycles, 'bands'),
  };
}

/**
 * Pasada de calidad del aspecto: los recursos que solo lucen sobre fondo oscuro no se dejan sobre uno claro
 * (un brillo de neón en los títulos se ve sucio; las tarjetas de vidrio sin nada detrás no se distinguen).
 */
export function guardLook(look: PageLook | undefined, palette: Palette): PageLook | undefined {
  if (!look) return look;
  const dark = luminance(palette.background) < 0.18;
  const next: PageLook = { ...look };
  if (!dark && next.effect === 'glow') next.effect = 'underline';
  if (!dark && next.surface === 'glass' && (!next.backdrop || next.backdrop === 'plain')) next.surface = 'elevated';
  if (!dark && next.button === 'glow') next.button = 'gradient';
  return next;
}

/**
 * El mínimo de riqueza visual de cualquier página, sea cual sea su tema: tarjetas con sombra (no planas), algo de decoración
 * detrás de todo (degradado suave, o resplandor si el fondo es oscuro) y un corte distinto de lo recto entre franjas. Lo que la
 * IA eligió por encima de ese mínimo se respeta.
 */
export function enrichLook(look: PageLook | undefined, palette: Palette, seed: string): PageLook {
  const dark = luminance(palette.background) < 0.18;
  const next: PageLook = { ...look };
  if (!next.surface || next.surface === 'flat') next.surface = 'elevated';
  if (!next.backdrop || next.backdrop === 'plain') next.backdrop = dark ? 'glow' : 'gradient';
  if (!next.divider || next.divider === 'none') next.divider = hash(`d:${seed}`) % 2 === 0 ? 'slant' : 'wave';
  return next;
}

/** Familias de tipografías de títulos con carácter parecido: se cambia dentro de la misma para no alterar el tono. */
const HEADING_FAMILIES: string[][] = [
  ['Playfair Display', 'Lora', 'Fraunces', 'Cormorant Garamond', 'Libre Baskerville', 'Merriweather', 'Bitter', 'Spectral', 'Crimson Pro', 'Zilla Slab', 'Young Serif', 'Instrument Serif', 'Gloock', 'Prata', 'DM Serif Display', 'Abril Fatface'],
  ['Poppins', 'Montserrat', 'Space Grotesk', 'Raleway', 'Sora', 'Syne', 'Unbounded', 'Rubik', 'Manrope', 'Outfit', 'Plus Jakarta Sans', 'Josefin Sans', 'Bricolage Grotesque', 'Epilogue', 'Lexend', 'Urbanist'],
  ['Oswald', 'Bebas Neue', 'Anton', 'Archivo Black'],
];

/**
 * Si la tipografía de títulos ya la usa otra página del negocio, se cambia por otra de su misma familia (serif, sans
 * geométrica o display) que no se haya usado; si ya se usaron todas, se deja como está.
 */
export function diversifyHeading(heading: string, used: string[], seed: string): string {
  if (!used.includes(heading)) return heading;
  const family = HEADING_FAMILIES.find((f) => f.includes(heading)) ?? [];
  const free = family.filter((f) => !used.includes(f));
  return free.length > 0 ? (free[hash(`h:${seed}`) % free.length] as string) : heading;
}

/** Una paleta de respaldo (de una de las direcciones de ejemplo) para cuando la IA no propone ninguna. */
export function fallbackDesign(seed: string): Pick<Direction, 'template' | 'fonts' | 'look' | 'palette'> {
  const d = DIRECTIONS[hash(`f:${seed}`) % DIRECTIONS.length] as Direction;
  return { template: d.template, fonts: d.fonts, look: d.look, palette: d.palette };
}

/** El estilo de cada bloque, completado con la dirección y corregido para que se vea bien. */
export function polishBlocks<T extends PolishBlock>(blocks: T[], direction: StyleHints): T[] {
  const ordered = [...blocks].sort((a, b) => a.order - b.order);
  const heroIndex = ordered.findIndex((b) => b.type === 'encabezado');
  const usedVariants = new Map<BlockType, string[]>();
  let destacado = false;
  let band = 0;

  const styled = ordered.map((block, index) => {
    const style = sanitizeBlockStyle(block.type, block.style);
    const options = BLOCK_VARIANTS[block.type];

    if (options) {
      let variant = typeof style.variant === 'string' ? style.variant : index === heroIndex ? direction.hero.variant : direction.variants[block.type];
      const used = usedVariants.get(block.type) ?? [];
      // Formas distintas entre bloques del mismo tipo, y un solo texto destacado.
      if (variant && used.includes(variant)) variant = options.find((o) => !used.includes(o) && !(o === 'destacado' && destacado)) ?? variant;
      if (variant === 'destacado' && block.type === 'texto') {
        if (destacado) variant = 'normal';
        destacado = true;
      }
      if (variant && options.includes(variant)) {
        style.variant = variant;
        usedVariants.set(block.type, [...used, variant]);
      }
    }

    if (block.type === 'imagen' || block.type === 'boton') {
      delete style.background;
    } else if (index === heroIndex) {
      // El encabezado siempre lleva una franja de color propio (nunca plano): el que eligió la IA si es de color, y si no, el de las pistas.
      const wanted = style.background as BlockBackground | undefined;
      const hint = direction.hero.background as BlockBackground | undefined;
      style.background = wanted && STRONG.includes(wanted) ? wanted : hint && STRONG.includes(hint) ? hint : 'gradient';
    } else if (!isBackground(style.background)) {
      style.background = direction.bands[band % direction.bands.length] ?? 'base';
      band += 1;
    }
    return { ...block, style };
  });

  // Ritmo: nunca dos franjas fuertes seguidas, y no más de una de cada tres.
  const limit = Math.max(2, Math.ceil(styled.length / 3));
  let strong = 0;
  let previous: BlockBackground | undefined;
  for (const block of styled) {
    let bg = block.style.background as BlockBackground | undefined;
    if (bg && STRONG.includes(bg)) {
      if ((previous && STRONG.includes(previous)) || strong >= limit) {
        bg = 'alt';
        block.style.background = bg;
      } else {
        strong += 1;
      }
    }
    // Una banda de botón es una franja fuerte por sí misma.
    const bandButton = block.type === 'boton' && block.style.variant === 'banda';
    previous = bandButton ? 'accent' : (bg ?? 'base');
  }

  // Una página nunca queda plana: si ninguna franja tiene color propio, el encabezado (o el primer bloque) toma uno.
  if (styled.length >= 2 && !styled.some((b) => STRONG.includes(b.style.background as BlockBackground) || (b.type === 'boton' && b.style.variant === 'banda'))) {
    const target = styled.find((b) => b.type !== 'imagen' && b.type !== 'boton') ?? styled[0];
    if (target) target.style.background = STRONG.includes(direction.hero.background as BlockBackground) ? (direction.hero.background as BlockBackground) : 'gradient';
  }

  // Toda página con 4 bloques o más lleva al menos dos franjas de color (el encabezado y otra más abajo), para que nunca quede plana.
  const colored = (b: { type: BlockType; style: Record<string, unknown> }) => STRONG.includes(b.style.background as BlockBackground) || (b.type === 'boton' && b.style.variant === 'banda');
  if (styled.length >= 4 && styled.filter(colored).length < 2) {
    const heroBg = styled[heroIndex >= 0 ? heroIndex : 0]?.style.background;
    const pick = direction.bands.find((b) => STRONG.includes(b) && b !== heroBg) ?? (heroBg === 'dark' ? 'gradient' : 'dark');
    for (let i = styled.length - 2; i > 0; i -= 1) {
      const candidate = styled[i];
      if (!candidate || ['imagen', 'boton', 'encabezado'].includes(candidate.type)) continue;
      if ([styled[i - 1], styled[i + 1]].some((n) => n && colored(n))) continue;
      candidate.style.background = pick;
      break;
    }
  }

  // Un botón en banda pegado a otra franja de color se pierde: se vuelve sólido.
  styled.forEach((block, i) => {
    if (block.type !== 'boton' || block.style.variant !== 'banda') return;
    const near = [styled[i - 1], styled[i + 1]].some((n) => n && STRONG.includes(n.style.background as BlockBackground));
    if (near) block.style.variant = 'solido';
  });

  return styled.map((block, i) => ({ ...block, order: i + 1 }));
}
