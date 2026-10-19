import type { FunnelObjective } from '@/services/funnels';
import type { BrandPalette } from '@/services/workspaces';
import type { TemplateId } from '@/shared/blocks/types';
import { ArrowUpRight, CalendarDays, CirclePlay, ClipboardCheck, Gift, Shuffle, ShoppingCart, Target, type LucideIcon } from 'lucide-react';

/**
 * Catálogo de las pantallas de funnels: los tipos que se pueden elegir (los mismos `objective` del
 * backend), las plantillas, lo que se le cuenta a la IA y los pasos del asistente.
 */

export interface Goal {
  /** El `objective` del backend. */
  id: FunnelObjective;
  /** `false`: todavía no se puede crear (necesita varias páginas por funnel). */
  available: boolean;
  name: string;
  description: string;
  icon: LucideIcon;
}

export const GOALS: Goal[] = [
  { id: 'leads', available: true, name: 'Captar leads', description: 'Recibe contactos calificados listos para dar seguimiento.', icon: Target },
  { id: 'venta', available: true, name: 'Vender un producto', description: 'Lleva a la persona directo al checkout.', icon: ShoppingCart },
  { id: 'citas', available: true, name: 'Agendar reuniones', description: 'Conecta tu calendario y confirma citas solo.', icon: CalendarDays },
  { id: 'magnet', available: true, name: 'Lead magnet', description: 'Entrega un recurso gratuito a cambio de datos.', icon: Gift },
  { id: 'webinar', available: true, name: 'Webinar o evento', description: 'Registra participantes y envía recordatorios.', icon: CirclePlay },
  { id: 'aplicacion', available: true, name: 'Aplicación', description: 'Filtra interesados con un formulario a medida.', icon: ClipboardCheck },
  { id: 'upsell', available: false, name: 'Upsell / downsell', description: 'Aumenta el valor de una compra ya hecha.', icon: ArrowUpRight },
  { id: 'libre', available: false, name: 'Funnel libre', description: 'Arma un flujo completamente personalizado.', icon: Shuffle },
];

export const goalOf = (objective: FunnelObjective): Goal => GOALS.find((goal) => goal.id === objective) ?? GOALS[0]!;

/** Lo que la persona le cuenta a la IA sobre su producto, su público y cómo debe sonar la página. */
export interface Brief {
  name: string;
  offer: string;
  result: string;
  price: string;
  audience: string;
  objections: string;
  tone: string;
  cta: string;
  extra: string;
}

export const TONES = [
  { id: 'cercano', name: 'Cercano' },
  { id: 'profesional', name: 'Profesional' },
  { id: 'inspirador', name: 'Inspirador' },
  { id: 'directo', name: 'Directo' },
  { id: 'divertido', name: 'Divertido' },
] as const;

export const EMPTY_BRIEF: Brief = { name: '', offer: '', result: '', price: '', audience: '', objections: '', tone: TONES[0].id, cta: '', extra: '' };

export interface Template {
  id: TemplateId;
  name: string;
  tag: string;
  description: string;
  /** Colores de la miniatura: son los de la marca del cliente de ejemplo, no los de la plataforma. */
  background: string;
  accent: string;
  /** La paleta de la plantilla, para negocios que todavía no definieron la suya. */
  palette: BrandPalette;
}

const palette = (primary: string, secondary: string, accent: string, background: string, text: string): BrandPalette => ({ primary, secondary, accent, background, text });

export const TEMPLATES: Template[] = [
  { id: 'claridad', name: 'Claridad', tag: 'Educación y cursos', description: 'Ideal para vender cursos y programas con inscripción directa.', background: '#EAF4F0', accent: '#0E7A63', palette: palette('#0E7A63', '#0A4A3C', '#F2B544', '#EAF4F0', '#0F1F1A') },
  { id: 'impacto', name: 'Impacto', tag: 'Ecommerce', description: 'Alto contraste para lanzamientos y ofertas por tiempo limitado.', background: '#FAEEEA', accent: '#C8442D', palette: palette('#C8442D', '#7A2415', '#F2B544', '#FAEEEA', '#2A1410') },
  { id: 'minimal', name: 'Minimal', tag: 'Servicios profesionales', description: 'Diseño sobrio para consultoría, estudios y servicios 1:1.', background: '#EEEEF0', accent: '#1F2A44', palette: palette('#1F2A44', '#11182B', '#B08D57', '#EEEEF0', '#12141C') },
  { id: 'encuentro', name: 'Encuentro', tag: 'Eventos', description: 'Pensada para registro a webinars y eventos en vivo.', background: '#F8F5E8', accent: '#B5860B', palette: palette('#B5860B', '#6E5006', '#2A6F97', '#F8F5E8', '#2A2410') },
  { id: 'recurso', name: 'Recurso', tag: 'Lead magnet', description: 'Entrega un recurso gratuito a cambio de datos de contacto.', background: '#EDF3F6', accent: '#2A6F97', palette: palette('#2A6F97', '#174560', '#E9A23B', '#EDF3F6', '#10222D') },
  { id: 'agenda', name: 'Agenda', tag: 'Agendar citas', description: 'Enfocada en reservar llamadas o citas desde el primer scroll.', background: '#F6EEF0', accent: '#8B2E5C', palette: palette('#8B2E5C', '#571B39', '#E9A23B', '#F6EEF0', '#2A1520') },
];

export const templateOf = (id: TemplateId): Template => TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0]!;

/** Pasos del wizard (títulos y subtítulos del mockup). */
export const WIZARD_STEPS = [
  { title: 'Objetivo del funnel', hint: 'Elige qué quieres lograr' },
  { title: 'Producto y público', hint: 'Qué vendes y a quién' },
  { title: 'Plantilla', hint: 'Un punto de partida ya diseñado' },
  { title: 'Generar con IA', hint: 'Estructura, textos y CTA' },
] as const;
