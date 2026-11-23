import { DIRECTIONS, hash, type Direction } from './directions.js';

/**
 * Lo que hace distinta una página de otra cuando la IA diseña: en cada generación se le da una «semilla creativa»
 * (una estructura, una estética y una temperatura de color de partida, distintas cada vez) y lo que ya usan las otras
 * páginas del negocio para que no se le parezca. La IA decide todo el diseño; esto solo la empuja a explorar.
 */

const STRUCTURES = [
  'corta y directa: encabezado, un solo beneficio fuerte y el llamado a la acción (4 bloques como máximo)',
  'historia primero: encabezado, un texto que cuente el problema y cómo se resuelve, beneficios y llamado a la acción',
  'prueba primero: encabezado y enseguida lo que demuestra que funciona (testimonios o cifras que la persona dio), luego beneficios',
  'paso a paso: encabezado, una sección que explique cómo funciona en pasos (beneficios numerados) y cierre con la acción',
  'pregunta y respuesta: encabezado con una pregunta provocadora, preguntas frecuentes arriba y los beneficios después',
  'oferta apilada: encabezado, precios o lo que incluye, beneficios que justifican el precio y garantía en texto destacado si la persona la dio',
  'larga y persuasiva: 8 a 10 bloques con textos de apoyo, beneficios, preguntas y dos llamados a la acción',
  'formulario temprano: encabezado, formulario casi de inmediato y los argumentos debajo para quien necesita más convencimiento',
  'editorial: mucho texto destacado, pocos bloques y mucho aire; se lee como un artículo',
  'visual: apóyate en las imágenes de la persona (si las hay) y deja los textos breves',
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
  estructura: string;
  estetica: string;
  paleta: string;
}

/** El punto de partida creativo de esta página: distinto en cada generación. */
export function creativeBrief(seed: string): CreativeBrief {
  return { estructura: pick(STRUCTURES, seed, 'e'), estetica: pick(AESTHETICS, seed, 'a'), paleta: pick(PALETTES, seed, 'p') };
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
