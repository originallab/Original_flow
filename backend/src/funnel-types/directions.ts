import type { BlockType } from './blocks.js';
import type { BlockBackground, PageLook } from './design.js';
import type { TemplateId } from './templates.js';

/**
 * Direcciones de diseño de referencia: combinaciones bien resueltas de tipografías, aspecto y paleta. NO se asignan a las
 * páginas: la IA diseña cada una desde cero. Sirven para dos cosas: ejemplos de calidad que se le muestran a la IA (sin
 * pedirle que los copie) y un respaldo si su propuesta no trae diseño. Todo vale solo si es del catálogo de `design.ts`.
 */

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

interface BlockStyleHint {
  variant?: string;
  background?: BlockBackground;
}

export interface Direction {
  id: string;
  /** Cómo es, en una frase: se le dice a la IA para que escriba en el mismo tono. */
  mood: string;
  template: TemplateId;
  fonts: { heading: string; body: string };
  look: PageLook;
  /** La paleta que se usa si el negocio no tiene la suya (o si la de la IA no se lee bien). */
  palette: Palette;
  /** Cómo se ve el primer bloque (el encabezado). */
  hero: BlockStyleHint;
  /** La forma preferida de cada tipo de bloque. */
  variants: Partial<Record<BlockType, string>>;
  /** Los fondos de las franjas que siguen al encabezado, en orden y en ciclo (cada uno se aplica solo a bloques que lo admiten). */
  bands: BlockBackground[];
}

export const DIRECTIONS: readonly Direction[] = [
  {
    id: 'editorial-calido',
    mood: 'editorial, cálido y de confianza; frases cuidadas, sin gritar',
    template: 'claridad',
    fonts: { heading: 'Playfair Display', body: 'Lato' },
    look: { radius: 'md', density: 'airy', align: 'left', headingCase: 'normal', headingWeight: 600 },
    palette: { primary: '#8B2E3C', secondary: '#4A3B3B', accent: '#C08A3E', background: '#FBF7F2', text: '#2B2124' },
    hero: { variant: 'izquierda', background: 'base' },
    variants: { beneficios: 'numerados', faq: 'abierto', precios: 'tarjetas', texto: 'destacado', boton: 'solido' },
    bands: ['base', 'alt', 'base', 'accent'],
  },
  {
    id: 'impacto-urbano',
    mood: 'directo, enérgico y de oferta; frases cortas y contundentes',
    template: 'impacto',
    fonts: { heading: 'Oswald', body: 'Open Sans' },
    look: { radius: 'none', density: 'compact', align: 'left', headingCase: 'upper', headingWeight: 800 },
    palette: { primary: '#E11D48', secondary: '#1F2937', accent: '#F59E0B', background: '#FFFFFF', text: '#111827' },
    hero: { variant: 'grande', background: 'dark' },
    variants: { beneficios: 'columnas', faq: 'compacto', precios: 'simple', texto: 'normal', boton: 'banda' },
    bands: ['base', 'alt', 'base', 'dark'],
  },
  {
    id: 'tecnologia-limpia',
    mood: 'moderno, preciso y claro; explica sin tecnicismos innecesarios',
    template: 'minimal',
    fonts: { heading: 'Space Grotesk', body: 'DM Sans' },
    look: { radius: 'sm', density: 'normal', align: 'left', headingCase: 'normal', headingWeight: 600 },
    palette: { primary: '#2563EB', secondary: '#334155', accent: '#38BDF8', background: '#F8FAFC', text: '#0F172A' },
    hero: { variant: 'dividido', background: 'base' },
    variants: { beneficios: 'columnas', faq: 'tarjetas', precios: 'tarjetas', texto: 'normal', boton: 'solido' },
    bands: ['base', 'dark', 'base', 'alt'],
  },
  {
    id: 'bienestar-sereno',
    mood: 'sereno, cercano y humano; transmite calma y acompañamiento',
    template: 'encuentro',
    fonts: { heading: 'Fraunces', body: 'Nunito' },
    look: { radius: 'pill', density: 'airy', align: 'center', headingCase: 'normal', headingWeight: 600 },
    palette: { primary: '#3F7D6B', secondary: '#2F4F46', accent: '#E2A36B', background: '#F7F5EF', text: '#22332E' },
    hero: { variant: 'centrado', background: 'base' },
    variants: { beneficios: 'tarjetas', faq: 'tarjetas', precios: 'simple', texto: 'destacado', boton: 'contorno' },
    bands: ['base', 'alt', 'accent', 'base'],
  },
  {
    id: 'profesional-sobrio',
    mood: 'sobrio, serio y confiable; lenguaje formal y concreto',
    template: 'minimal',
    fonts: { heading: 'Lora', body: 'Source Sans 3' },
    look: { radius: 'sm', density: 'normal', align: 'left', headingCase: 'normal', headingWeight: 600 },
    palette: { primary: '#1E3A5F', secondary: '#3A4A5E', accent: '#B8893B', background: '#FFFFFF', text: '#14213D' },
    hero: { variant: 'izquierda', background: 'dark' },
    variants: { beneficios: 'lista', faq: 'abierto', precios: 'simple', texto: 'normal', boton: 'solido' },
    bands: ['base', 'alt', 'base', 'alt'],
  },
  {
    id: 'energia-fitness',
    mood: 'motivador, intenso y activo; verbos de acción',
    template: 'impacto',
    fonts: { heading: 'Montserrat', body: 'Open Sans' },
    look: { radius: 'sm', density: 'compact', align: 'left', headingCase: 'upper', headingWeight: 800 },
    palette: { primary: '#EA580C', secondary: '#27272A', accent: '#FACC15', background: '#FAFAF9', text: '#18181B' },
    hero: { variant: 'grande', background: 'accent' },
    variants: { beneficios: 'numerados', faq: 'compacto', precios: 'tarjetas', texto: 'destacado', boton: 'banda' },
    bands: ['base', 'dark', 'base', 'alt'],
  },
  {
    id: 'creativo-vibrante',
    mood: 'creativo, atrevido y con personalidad; permite humor ligero',
    template: 'recurso',
    fonts: { heading: 'Sora', body: 'DM Sans' },
    look: { radius: 'lg', density: 'normal', align: 'center', headingCase: 'normal', headingWeight: 700 },
    palette: { primary: '#7C3AED', secondary: '#4C1D95', accent: '#F472B6', background: '#FFFBFE', text: '#1E1B2E' },
    hero: { variant: 'centrado', background: 'accent' },
    variants: { beneficios: 'tarjetas', faq: 'tarjetas', precios: 'tarjetas', texto: 'destacado', boton: 'solido' },
    bands: ['base', 'alt', 'base', 'dark'],
  },
  {
    id: 'gastronomia-calida',
    mood: 'apetitoso, cálido y cercano; invita a probar',
    template: 'encuentro',
    fonts: { heading: 'DM Serif Display', body: 'Open Sans' },
    look: { radius: 'md', density: 'normal', align: 'center', headingCase: 'normal', headingWeight: 500 },
    palette: { primary: '#B4472A', secondary: '#5A3A2E', accent: '#D9A441', background: '#FFF9F2', text: '#2E1F1A' },
    hero: { variant: 'centrado', background: 'alt' },
    variants: { beneficios: 'tarjetas', faq: 'compacto', precios: 'tarjetas', texto: 'destacado', boton: 'solido' },
    bands: ['base', 'accent', 'base', 'alt'],
  },
  {
    id: 'eventos-festivo',
    mood: 'entusiasta y con prisa amable; transmite que algo pasa pronto',
    template: 'encuentro',
    fonts: { heading: 'Poppins', body: 'Nunito' },
    look: { radius: 'lg', density: 'normal', align: 'center', headingCase: 'normal', headingWeight: 700 },
    palette: { primary: '#4F46E5', secondary: '#312E81', accent: '#F97316', background: '#FFFFFF', text: '#1E1B4B' },
    hero: { variant: 'grande', background: 'accent' },
    variants: { beneficios: 'tarjetas', faq: 'abierto', precios: 'tarjetas', texto: 'normal', boton: 'banda' },
    bands: ['base', 'alt', 'dark', 'base'],
  },
  {
    id: 'lujo-sobrio',
    mood: 'elegante, exclusivo y pausado; pocas palabras, bien elegidas',
    template: 'minimal',
    fonts: { heading: 'Playfair Display', body: 'Lato' },
    look: { radius: 'none', density: 'airy', align: 'center', headingCase: 'normal', headingWeight: 500 },
    palette: { primary: '#1C1917', secondary: '#44403C', accent: '#B8893B', background: '#FAF8F4', text: '#1C1917' },
    hero: { variant: 'centrado', background: 'base' },
    variants: { beneficios: 'lista', faq: 'abierto', precios: 'simple', texto: 'destacado', boton: 'contorno' },
    bands: ['base', 'dark', 'base', 'alt'],
  },
  {
    id: 'naturaleza-organica',
    mood: 'natural, honesto y tranquilo; habla de origen y cuidado',
    template: 'recurso',
    fonts: { heading: 'Lora', body: 'Nunito' },
    look: { radius: 'lg', density: 'airy', align: 'left', headingCase: 'normal', headingWeight: 600 },
    palette: { primary: '#4D7C0F', secondary: '#3F3A2B', accent: '#CA8A04', background: '#FAF9F3', text: '#26301A' },
    hero: { variant: 'dividido', background: 'alt' },
    variants: { beneficios: 'lista', faq: 'tarjetas', precios: 'tarjetas', texto: 'normal', boton: 'solido' },
    bands: ['base', 'alt', 'accent', 'base'],
  },
  {
    id: 'comunidad-cercana',
    mood: 'amable, cercano y optimista; habla de tú a tú',
    template: 'recurso',
    fonts: { heading: 'Poppins', body: 'Nunito' },
    look: { radius: 'pill', density: 'normal', align: 'center', headingCase: 'normal', headingWeight: 600 },
    palette: { primary: '#0F766E', secondary: '#134E4A', accent: '#FB7185', background: '#F8FFFE', text: '#12302D' },
    hero: { variant: 'centrado', background: 'accent' },
    variants: { beneficios: 'tarjetas', faq: 'abierto', precios: 'simple', texto: 'destacado', boton: 'solido' },
    bands: ['base', 'alt', 'base', 'dark'],
  },
  {
    id: 'confianza-solida',
    mood: 'sólido, claro y tranquilizador; datos concretos y compromiso',
    template: 'claridad',
    fonts: { heading: 'Montserrat', body: 'Open Sans' },
    look: { radius: 'md', density: 'normal', align: 'left', headingCase: 'normal', headingWeight: 700 },
    palette: { primary: '#1D4ED8', secondary: '#1E293B', accent: '#F59E0B', background: '#FFFFFF', text: '#0F172A' },
    hero: { variant: 'dividido', background: 'dark' },
    variants: { beneficios: 'numerados', faq: 'compacto', precios: 'tarjetas', texto: 'normal', boton: 'solido' },
    bands: ['base', 'alt', 'base', 'accent'],
  },
  {
    id: 'claridad-neutra',
    mood: 'claro, amable y directo',
    template: 'claridad',
    fonts: { heading: 'Montserrat', body: 'Inter' },
    look: { radius: 'md', density: 'normal', align: 'left', headingCase: 'normal', headingWeight: 700 },
    palette: { primary: '#6D28D9', secondary: '#3B3552', accent: '#F59E0B', background: '#FFFFFF', text: '#1F1A2B' },
    hero: { variant: 'centrado', background: 'base' },
    variants: { beneficios: 'tarjetas', faq: 'abierto', precios: 'tarjetas', texto: 'normal', boton: 'solido' },
    bands: ['base', 'alt', 'base', 'accent'],
  },
];

/** Un número estable (0 a 2^32) a partir de un texto. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
