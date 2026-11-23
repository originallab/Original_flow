import type { FunnelObjective } from '../generated/prisma/client.js';
import type { BlockType } from './blocks.js';
import type { BlockBackground, PageLook } from './design.js';
import type { TemplateId } from './templates.js';

/**
 * Direcciones de diseño: combinaciones ya probadas de tipografías, aspecto, paleta y ritmo de fondos que se ven bien
 * juntas. Para cada página se elige una según los datos del negocio (rubro, tono, objetivo...) y con una semilla, para
 * que dos negocios parecidos tampoco salgan iguales. La IA escribe el contenido; el diseño sale de aquí, así que no
 * depende de que el modelo acierte con la estética. Todo vale solo si es del catálogo de `design.ts`.
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
  /** Palabras del rubro, del tono o del público con las que encaja (sin tildes y en minúsculas). */
  keywords: string[];
  objectives?: FunnelObjective[];
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
    keywords: ['curso', 'educacion', 'clase', 'taller', 'mentoria', 'coaching', 'aprender', 'escuela', 'formacion', 'diplomado', 'academia', 'libro', 'escritor'],
    objectives: ['venta', 'aplicacion'],
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
    keywords: ['oferta', 'descuento', 'tienda', 'ecommerce', 'lanzamiento', 'promocion', 'venta', 'ropa', 'calzado', 'producto', 'outlet', 'rebaja'],
    objectives: ['venta', 'upsell'],
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
    keywords: ['software', 'app', 'aplicacion', 'saas', 'tecnologia', 'plataforma', 'digital', 'startup', 'automatizacion', 'datos', 'sistema', 'programacion', 'inteligencia artificial'],
    objectives: ['leads', 'aplicacion'],
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
    keywords: ['terapia', 'psicologia', 'salud', 'bienestar', 'yoga', 'meditacion', 'nutricion', 'spa', 'masaje', 'clinica', 'medico', 'dentista', 'cuidado', 'mindfulness', 'terapeuta'],
    objectives: ['citas'],
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
    keywords: ['consultoria', 'abogado', 'legal', 'contador', 'contabilidad', 'finanzas', 'fiscal', 'auditoria', 'asesoria', 'despacho', 'notaria', 'impuestos', 'empresa', 'b2b', 'corporativo'],
    objectives: ['citas', 'leads'],
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
    keywords: ['fitness', 'gimnasio', 'deporte', 'entrenamiento', 'crossfit', 'running', 'musculo', 'bajar de peso', 'entrenador', 'futbol', 'ciclismo', 'maraton', 'box'],
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
    keywords: ['diseno', 'arte', 'creativo', 'marketing', 'agencia', 'fotografia', 'video', 'musica', 'ilustracion', 'branding', 'redes sociales', 'contenido', 'estudio', 'influencer'],
    objectives: ['magnet', 'leads'],
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
    keywords: ['restaurante', 'comida', 'cafe', 'cafeteria', 'panaderia', 'pasteleria', 'chef', 'cocina', 'gastronomia', 'catering', 'bar', 'taqueria', 'reposteria', 'pizza', 'cerveza', 'vino'],
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
    keywords: ['evento', 'webinar', 'conferencia', 'congreso', 'seminario', 'en vivo', 'masterclass', 'reto', 'taller en vivo', 'fiesta', 'concierto', 'festival'],
    objectives: ['webinar'],
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
    keywords: ['joyeria', 'moda', 'lujo', 'premium', 'exclusivo', 'belleza', 'cosmetica', 'perfume', 'boutique', 'diseñador', 'alta costura', 'relojes', 'maquillaje', 'salon'],
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
    keywords: ['ecologico', 'organico', 'natural', 'sustentable', 'agricola', 'huerto', 'mascotas', 'veterinaria', 'hogar', 'plantas', 'jardin', 'artesanal', 'granja', 'campo', 'vegano'],
    objectives: ['magnet'],
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
    keywords: ['comunidad', 'ong', 'fundacion', 'voluntariado', 'infantil', 'ninos', 'idiomas', 'ingles', 'club', 'familia', 'jovenes', 'social', 'iglesia', 'donacion'],
    objectives: ['leads', 'magnet'],
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
    keywords: ['inmobiliaria', 'bienes raices', 'construccion', 'seguros', 'automotriz', 'autos', 'credito', 'prestamo', 'arquitectura', 'remodelacion', 'transporte', 'logistica', 'ingenieria', 'casa', 'departamento'],
    objectives: ['leads', 'citas'],
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
    keywords: [],
    hero: { variant: 'centrado', background: 'base' },
    variants: { beneficios: 'tarjetas', faq: 'abierto', precios: 'tarjetas', texto: 'normal', boton: 'solido' },
    bands: ['base', 'alt', 'base', 'accent'],
  },
];

const FALLBACK = DIRECTIONS[DIRECTIONS.length - 1] as Direction;

export interface DirectionInput {
  objective: FunnelObjective;
  /** Todo el texto del negocio que ayuda a ubicar el rubro y el tono (nombre, producto, público, marca, detalles). */
  text: string;
  /** Lo que hace distinta una página de otra con los mismos datos. */
  seed: string;
  /** Las tipografías de las otras páginas del negocio: se evita repetirlas. */
  used?: { heading?: unknown; body?: unknown }[];
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** ¿Aparece la palabra (o frase) completa, con o sin plural? Así «ong» no coincide con «tengo». */
export const hasWord = (text: string, word: string) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalize(word))}(s|es)?($|[^a-z0-9])`).test(text);

/** Un número estable (0 a 2^32) a partir de un texto. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** La dirección de una página que ya tiene diseño (para conservar su estilo al volver a generar); `null` si no es de ninguna. */
export function directionOfDesign(design: unknown): Direction | null {
  const fonts = (design as { fonts?: { heading?: unknown; body?: unknown } } | null)?.fonts;
  if (!fonts) return null;
  return DIRECTIONS.find((d) => d.fonts.heading === fonts.heading && d.fonts.body === fonts.body) ?? null;
}

/**
 * Elige la dirección que mejor encaja con el negocio. Puntúa palabras del rubro y del objetivo; entre las mejores
 * decide la semilla, y se evitan las tipografías que ya usan otras páginas del negocio para que no se parezcan.
 */
export function chooseDirection(input: DirectionInput): Direction {
  const text = normalize(input.text);
  const scored = DIRECTIONS.filter((d) => d !== FALLBACK).map((d) => {
    const hits = d.keywords.filter((k) => hasWord(text, k)).length;
    return { d, score: hits * 3 + (d.objectives?.includes(input.objective) ? 2 : 0) };
  });
  const best = Math.max(...scored.map((s) => s.score));
  // Con coincidencias claras, solo compiten las más cercanas; sin ninguna, compiten todas (variedad).
  const pool = best >= 3 ? scored.filter((s) => s.score >= best - 2) : scored.filter((s) => s.score >= Math.max(best, 0));
  const taken = new Set((input.used ?? []).map((u) => `${String(u.heading)}|${String(u.body)}`));
  const fresh = pool.filter((s) => !taken.has(`${s.d.fonts.heading}|${s.d.fonts.body}`));
  // Si todas las del grupo ya se usaron, se abre a cualquier dirección que no se haya usado antes.
  const open = fresh.length > 0 ? fresh : scored.filter((s) => !taken.has(`${s.d.fonts.heading}|${s.d.fonts.body}`));
  const candidates = open.length > 0 ? open : pool;
  return (candidates[hash(input.seed) % candidates.length]?.d ?? FALLBACK);
}
