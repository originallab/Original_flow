import { DIRECTIONS, hash, type Direction } from './directions.js';
import { randomHints } from './polish.js';

/**
 * Lo que hace distinta una página de otra cuando la IA diseña: en cada generación se le da una «semilla creativa»
 * (una estructura, una estética y una temperatura de color de partida, distintas cada vez) y lo que ya usan las otras
 * páginas del negocio para que no se le parezca. La IA decide todo el diseño; esto solo la empuja a explorar.
 */

/** Secuencias de bloques de partida (la IA las adapta al negocio: puede quitar o agregar hasta dos bloques). */
const STRUCTURES: { nombre: string; secuencia: string[] }[] = [
  { nombre: 'corta y directa', secuencia: ['encabezado', 'beneficios', 'boton'] },
  { nombre: 'historia primero', secuencia: ['encabezado', 'texto', 'beneficios', 'texto', 'boton'] },
  { nombre: 'paso a paso', secuencia: ['encabezado', 'beneficios', 'requisitos', 'faq', 'boton'] },
  { nombre: 'pregunta primero', secuencia: ['encabezado', 'faq', 'beneficios', 'boton'] },
  { nombre: 'oferta apilada', secuencia: ['encabezado', 'precios', 'beneficios', 'faq', 'boton'] },
  { nombre: 'larga y persuasiva', secuencia: ['encabezado', 'texto', 'beneficios', 'texto', 'precios', 'faq', 'texto', 'formulario'] },
  { nombre: 'formulario temprano', secuencia: ['encabezado', 'formulario', 'beneficios', 'faq', 'boton'] },
  { nombre: 'editorial', secuencia: ['encabezado', 'texto', 'texto', 'beneficios', 'boton'] },
  { nombre: 'problema y solución', secuencia: ['encabezado', 'texto', 'beneficios', 'precios', 'boton'] },
  { nombre: 'confianza primero', secuencia: ['encabezado', 'beneficios', 'faq', 'texto', 'formulario'] },
];

const AESTHETICS = [
  'editorial y cálida, con tipografía serif y fondos crema',
  'audaz y de alto contraste, con títulos enormes y esquinas rectas',
  'limpia y tecnológica, con mucho espacio y una sola nota de color',
  'orgánica y suave, con esquinas muy redondeadas y colores de la naturaleza',
  'elegante y minimalista, con pocas palabras y mucho aire',
  'enérgica y juvenil, con colores vivos y franjas de color',
  'sobria y corporativa, con azules profundos y textos serenos',
  'artesanal y cercana, con tonos tierra y tipografía con carácter',
  'oscura y dramática, con una franja oscura protagonista',
  'lúdica y optimista, con colores alegres y formas redondeadas',
];

const PALETTES = [
  'cálida (terracota, mostaza, crema)',
  'fría (azules, verdes agua, grises)',
  'monocromática (un solo color en varios tonos)',
  'complementaria (dos colores opuestos bien elegidos)',
  'neutra con un acento potente',
  'oscura con un acento brillante',
  'pastel y suave',
  'tierra y naturaleza (verdes, marrones, ocres)',
];

const pick = <T>(list: readonly T[], seed: string, salt: string): T => list[hash(`${salt}:${seed}`) % list.length] as T;

export interface CreativeBrief {
  /** Cómo se llama la estructura y qué bloques lleva, en orden. */
  estructura: string;
  estetica: string;
  paleta: string;
  /** Formas y fondo sugeridos para el encabezado y los bloques con variantes. */
  formas: string;
}

/** El punto de partida creativo de esta página: distinto en cada generación. */
export function creativeBrief(seed: string): CreativeBrief {
  const e = pick(STRUCTURES, seed, 'e');
  const hints = randomHints(seed);
  const formas = Object.entries(hints.variants).filter(([tipo]) => e.secuencia.includes(tipo)).map(([tipo, v]) => `${tipo}: ${v}`);
  return {
    estructura: `${e.nombre}: ${e.secuencia.join(' > ')}`,
    estetica: pick(AESTHETICS, seed, 'a'),
    paleta: pick(PALETTES, seed, 'p'),
    formas: `encabezado ${hints.hero.variant} sobre fondo ${hints.hero.background}; ${formas.filter((f) => !f.startsWith('encabezado')).join(', ')}`,
  };
}

/** Ejemplos de diseños bien resueltos (solo para fijar el nivel de calidad: la IA no debe copiarlos). */
export function qualityExamples(seed: string, count: number): Pick<Direction, 'fonts' | 'look' | 'palette'>[] {
  const start = hash(`x:${seed}`) % DIRECTIONS.length;
  return Array.from({ length: count }, (_, i) => DIRECTIONS[(start + i * 5) % DIRECTIONS.length] as Direction).map((d) => ({ fonts: d.fonts, look: d.look, palette: d.palette }));
}

/** Un resumen corto del diseño y la estructura de otra página del negocio, para pedirle a la IA que no se le parezca. */
export function describeDesign(design: unknown, content: unknown): string | null {
  const d = design as { fonts?: { heading?: string }; palette?: { primary?: string; background?: string }; look?: { radius?: string } } | null;
  const blocks = (content as { blocks?: { type?: string }[] } | null)?.blocks;
  if (!d?.fonts?.heading) return null;
  const orden = Array.isArray(blocks) ? blocks.map((b) => b.type).filter((t): t is string => typeof t === 'string').join('>') : '';
  return `títulos ${d.fonts.heading}, color ${d.palette?.primary ?? '?'} sobre ${d.palette?.background ?? '?'}, esquinas ${d.look?.radius ?? '?'}${orden ? `, bloques ${orden}` : ''}`;
}
