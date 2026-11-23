import type { BlockType } from './blocks.js';
import { BACKGROUNDS, BLOCK_VARIANTS, sanitizeBlockStyle, type BlockBackground } from './design.js';
import type { Direction, Palette } from './directions.js';

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

const STRONG: readonly BlockBackground[] = ['accent', 'dark'];
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

/**
 * La paleta de la página: la de la marca si la tiene (es suya y no se toca); si no, la que propuso la IA si se lee bien;
 * y si no, la de la dirección.
 */
export function pickPalette(direction: Direction, brand?: Palette, proposed?: Palette): Palette {
  if (brand) return brand;
  if (proposed && paletteReads(proposed)) return proposed;
  return direction.palette;
}

/** El estilo de cada bloque, completado con la dirección y corregido para que se vea bien. */
export function polishBlocks<T extends PolishBlock>(blocks: T[], direction: Direction): T[] {
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
    } else if (index === heroIndex && !isBackground(style.background) && direction.hero.background) {
      style.background = direction.hero.background;
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

  // Un botón en banda pegado a otra franja de color se pierde: se vuelve sólido.
  styled.forEach((block, i) => {
    if (block.type !== 'boton' || block.style.variant !== 'banda') return;
    const near = [styled[i - 1], styled[i + 1]].some((n) => n && STRONG.includes(n.style.background as BlockBackground));
    if (near) block.style.variant = 'solido';
  });

  return styled.map((block, i) => ({ ...block, order: i + 1 }));
}
