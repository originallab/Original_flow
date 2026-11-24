import type { BlockType } from './blocks.js';
import { BLOCK_VARIANTS, type PageLook } from './design.js';
import { hash } from './directions.js';
import { repairPalette, type PolishBlock } from './polish.js';
import type { Palette } from './directions.js';

/**
 * Novedad: cada página generada debe diferenciarse de las que ya tiene el negocio. La IA tiende a repetirse (mismos fondos
 * crema, mismo encabezado, misma secuencia de bloques), así que, después de generar, el servidor compara con las páginas
 * anteriores del negocio y cambia lo que se repite. Todo es determinista para una semilla y solo usa opciones del catálogo.
 */

/** Lo que importa de una página anterior para compararla con la nueva. */
export interface PastPage {
  palette?: Palette;
  look?: PageLook;
  /** Los bloques de la página, en orden. */
  blocks: { type: BlockType; style: Record<string, unknown> }[];
}

const asRecord = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** Lee de forma defensiva el diseño y el contenido guardados de una página anterior. */
export function pastPageOf(designSpec: unknown, content: unknown): PastPage {
  const d = asRecord(designSpec);
  const blocks = asRecord(content).blocks;
  return {
    palette: d.palette && typeof asRecord(d.palette).primary === 'string' ? (d.palette as Palette) : undefined,
    look: asRecord(d.look) as PageLook,
    blocks: Array.isArray(blocks) ? blocks.map((b) => ({ type: asRecord(b).type as BlockType, style: asRecord(asRecord(b).style) })).filter((b) => typeof b.type === 'string') : [],
  };
}

// ---------------------------------------------------------------- elección rotativa

/**
 * Si el valor elegido ya se repite en las páginas recientes (es igual al de la anterior, o está en la mitad o más de las
 * últimas cuatro), se cambia por la opción menos usada (al azar entre las empatadas, según la semilla). Si no, se respeta.
 */
export function rotateChoice<T extends string>(current: T | undefined, options: readonly T[], past: (T | undefined)[], seed: string, salt: string): T | undefined {
  const recent = past.slice(0, 4);
  const repeats = current !== undefined && (past[0] === current || recent.filter((v) => v === current).length >= Math.max(2, Math.ceil(recent.length / 2)));
  if (current !== undefined && !repeats) return current;
  if (current === undefined && past.length === 0) return current;
  const pool = options.filter((o) => o !== current);
  if (pool.length === 0) return current;
  const uses = (o: T) => past.slice(0, 8).filter((v) => v === o).length;
  const least = Math.min(...pool.map(uses));
  const ties = pool.filter((o) => uses(o) === least);
  return ties[hash(`${salt}:${seed}`) % ties.length] as T;
}

// ---------------------------------------------------------------- aspecto

const LOOK_AXES: { key: 'surface' | 'backdrop' | 'divider' | 'effect' | 'button'; options: readonly string[] }[] = [
  { key: 'surface', options: ['elevated', 'outline', 'glass', 'glow', 'flat'] },
  { key: 'backdrop', options: ['gradient', 'dots', 'grid', 'glow', 'plain'] },
  { key: 'divider', options: ['slant', 'wave', 'zigzag'] },
  { key: 'effect', options: ['none', 'underline', 'gradient', 'glow'] },
  { key: 'button', options: ['solid', 'gradient', 'glow'] },
];

/** Cambia del aspecto lo que se repite en las páginas anteriores (tarjetas, fondo, cortes, efecto de títulos y botones). */
export function noveltyLook(look: PageLook, past: PastPage[], seed: string): PageLook {
  const next: Record<string, unknown> = { ...look };
  for (const axis of LOOK_AXES) {
    const values = past.map((p) => (p.look as Record<string, string | undefined> | undefined)?.[axis.key]);
    const chosen = rotateChoice(next[axis.key] as string | undefined, axis.options, values, seed, `look:${axis.key}`);
    if (chosen !== undefined) next[axis.key] = chosen;
  }
  // La combinación completa de lo que más se nota (tarjetas, fondo y corte) no puede repetir la de ninguna de las últimas páginas.
  const combo = (l: Record<string, unknown>) => `${l.surface}/${l.backdrop}/${l.divider}`;
  const taken = new Set(past.slice(0, 8).map((p) => combo((p.look ?? {}) as Record<string, unknown>)));
  const comboAxes = LOOK_AXES.slice(0, 3);
  for (let attempt = 0; attempt < 12 && taken.has(combo(next)); attempt += 1) {
    const axis = comboAxes[hash(`combo:${seed}:${attempt}`) % comboAxes.length] as (typeof LOOK_AXES)[number];
    const others = axis.options.filter((o) => o !== next[axis.key]);
    next[axis.key] = others[hash(`combo-v:${seed}:${attempt}`) % others.length];
  }
  // La alineación y las mayúsculas de los títulos también se alternan cuando las últimas páginas son iguales.
  const align = rotateChoice(look.align, ['left', 'center'] as const, past.map((p) => p.look?.align), seed, 'look:align');
  if (align) next.align = align;
  return next as PageLook;
}

// ---------------------------------------------------------------- color

/** Pasa un color `#RRGGBB` a matiz (0-360), saturación y luminosidad (0-1). */
function toHsl(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export type Bucket = 'dark' | 'cream' | 'neutral' | 'tinted';

/** La «familia» del fondo de una paleta: oscuro, crema (cálido claro), neutro (blanco o gris) o con tinte de color. */
export function bucketOf(p: Palette): Bucket {
  const [h, , l] = toHsl(p.background);
  if (l < 0.2) return 'dark';
  // Neutro: casi sin color (blanco, gris, un blanco azulado); lo demás es crema (cálido) o con tinte.
  const v = Number.parseInt(p.background.slice(1), 16);
  const chroma = (Math.max((v >> 16) & 255, (v >> 8) & 255, v & 255) - Math.min((v >> 16) & 255, (v >> 8) & 255, v & 255)) / 255;
  if (chroma < 0.02) return 'neutral';
  return h >= 15 && h <= 60 ? 'cream' : 'tinted';
}

/** Gira el matiz de todos los colores con color (no el gris del texto); el brillo y la saturación se conservan. */
function rotateHue(p: Palette, degrees: number): Palette {
  const turn = (hex: string) => {
    const [h, s, l] = toHsl(hex);
    return s < 0.08 ? hex : fromHsl(h + degrees, s, l);
  };
  return { primary: turn(p.primary), secondary: turn(p.secondary), accent: turn(p.accent), background: turn(p.background), text: turn(p.text) };
}

/** El fondo (y el texto) de la paleta en otra «familia», con el color de marca como tinte. */
function withBucket(p: Palette, bucket: Bucket): Palette {
  const [h] = toHsl(p.primary);
  switch (bucket) {
    case 'dark': {
      const [, ps, pl] = toHsl(p.primary);
      return { ...p, background: fromHsl(h, 0.4, 0.07), text: fromHsl(h, 0.15, 0.94), primary: pl < 0.55 ? fromHsl(h, Math.max(ps, 0.6), 0.62) : p.primary, secondary: fromHsl(h, 0.3, 0.72) };
    }
    case 'tinted':
      return { ...p, background: fromHsl(h, 0.32, 0.95) };
    case 'cream':
      return { ...p, background: fromHsl(38, 0.5, 0.95) };
    default:
      return { ...p, background: '#F8FAFC' };
  }
}

/**
 * Cambia la paleta cuando se parece a la de páginas anteriores: si el color de marca cae en el mismo matiz, se gira el matiz de
 * toda la paleta; si el fondo es de la misma familia que el de las últimas páginas (por ejemplo, crema otra vez), se cambia de
 * familia. Después se corrige para que siga leyéndose bien. (No se usa con la paleta de la marca del negocio.)
 */
export function noveltyPalette(palette: Palette, past: PastPage[], seed: string): Palette {
  const before = past.filter((p) => p.palette);
  if (before.length === 0) return palette;
  let next = palette;

  const primaries = before.map((p) => toHsl((p.palette as Palette).primary)[0]);
  const [h0, s0] = toHsl(next.primary);
  const nearest = (h: number) => Math.min(...primaries.map((x) => hueDistance(h, x)));
  if (s0 > 0.2 && nearest(h0) < 35) {
    for (let k = 0; k < 14; k += 1) {
      const candidate = rotateHue(next, 40 + (hash(`pal:${seed}:${k}`) % 280));
      if (nearest(toHsl(candidate.primary)[0]) >= 45) {
        next = candidate;
        break;
      }
    }
  }

  const buckets = before.map((p) => bucketOf(p.palette as Palette));
  const current = bucketOf(next);
  if (buckets.slice(0, 3).filter((b) => b === current).length >= 2 || (buckets[0] === current && current !== 'neutral')) {
    const all: Bucket[] = ['neutral', 'tinted', 'dark', 'cream'];
    const uses = (b: Bucket) => buckets.slice(0, 8).filter((x) => x === b).length;
    const pool = all.filter((b) => b !== current);
    const least = Math.min(...pool.map(uses));
    const ties = pool.filter((b) => uses(b) === least);
    next = withBucket(next, ties[hash(`bucket:${seed}`) % ties.length] as Bucket);
  }
  return repairPalette(next);
}

// ---------------------------------------------------------------- encabezado, formas y estructura

const STRONG_BGS = ['accent', 'dark', 'gradient', 'mesh'] as const;

/** Cambia la forma y el fondo del encabezado cuando repiten los de las páginas anteriores. */
export function noveltyHero(style: Record<string, unknown>, past: PastPage[], seed: string): Record<string, unknown> {
  const heroOf = (p: PastPage) => p.blocks.find((b) => b.type === 'encabezado')?.style ?? {};
  const variants = BLOCK_VARIANTS.encabezado ?? [];
  const variant = rotateChoice(style.variant as string | undefined, variants, past.map((p) => heroOf(p).variant as string | undefined), seed, 'hero:variant');
  const background = rotateChoice(style.background as string | undefined, STRONG_BGS, past.map((p) => heroOf(p).background as string | undefined), seed, 'hero:bg');
  return { ...style, ...(variant ? { variant } : {}), ...(background ? { background } : {}) };
}

/** Cambia la forma de cada tipo de bloque cuando es la misma que usaron las últimas páginas. */
export function noveltyVariants<T extends PolishBlock>(blocks: T[], past: PastPage[], seed: string): T[] {
  return blocks.map((block, i) => {
    const options = BLOCK_VARIANTS[block.type];
    if (!options || block.type === 'encabezado' || typeof block.style.variant !== 'string') return block;
    const values = past.map((p) => p.blocks.find((b) => b.type === block.type)?.style.variant as string | undefined);
    const variant = rotateChoice(block.style.variant, options, values, seed, `var:${block.type}:${i}`);
    return variant === block.style.variant ? block : { ...block, style: { ...block.style, variant } };
  });
}

const PREFIX = 3;
const prefixOf = (types: string[]) => types.slice(0, PREFIX).join('>');

/**
 * Si la página empieza con la misma secuencia de bloques que alguna de las últimas del negocio, se reordenan los bloques de en
 * medio (el encabezado queda primero y el llamado a la acción al final) hasta que el principio sea distinto.
 */
export function noveltyStructure<T extends PolishBlock>(blocks: T[], past: PastPage[], seed: string): T[] {
  const ordered = [...blocks].sort((a, b) => a.order - b.order);
  if (ordered.length < 4) return ordered;
  const last = ordered[ordered.length - 1] as T;
  const closes = last.type === 'boton' || last.type === 'formulario';
  const head = ordered[0] as T;
  const middle = ordered.slice(1, closes ? -1 : undefined);
  const used = new Set(past.slice(0, 6).map((p) => prefixOf(p.blocks.map((b) => b.type))));
  const sequence = (mid: T[]) => [head, ...mid, ...(closes ? [last] : [])];
  if (!used.has(prefixOf(sequence(middle).map((b) => b.type)))) return sequence(middle);

  let best = middle;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const shuffled = [...middle];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = hash(`shuffle:${seed}:${attempt}:${i}`) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j] as T, shuffled[i] as T];
    }
    best = shuffled;
    if (!used.has(prefixOf(sequence(shuffled).map((b) => b.type)))) break;
  }
  return sequence(best).map((b, i) => ({ ...b, order: i + 1 }));
}
