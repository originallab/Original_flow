import { ArrowUpRight, CalendarDays, CirclePlay, ClipboardCheck, Gift, Shuffle, ShoppingCart, Target, type LucideIcon } from 'lucide-react';

/**
 * CÁSCARA: textos y datos de ejemplo de las pantallas de funnels, tomados de los mockups
 * (Wizard y Biblioteca de plantillas). Todavía no vienen del backend (`GET /funnel-types`); cuando
 * las pantallas se conecten, este archivo se reemplaza por el servicio.
 */

export interface Goal {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
}

export const GOALS: Goal[] = [
  { id: 'lead_capture', name: 'Captar leads', description: 'Recibe contactos calificados listos para dar seguimiento.', icon: Target },
  { id: 'sales', name: 'Vender un producto', description: 'Lleva a la persona directo al checkout.', icon: ShoppingCart },
  { id: 'appointment', name: 'Agendar reuniones', description: 'Conecta tu calendario y confirma citas solo.', icon: CalendarDays },
  { id: 'lead_magnet', name: 'Lead magnet', description: 'Entrega un recurso gratuito a cambio de datos.', icon: Gift },
  { id: 'webinar', name: 'Webinar o evento', description: 'Registra participantes y envía recordatorios.', icon: CirclePlay },
  { id: 'application', name: 'Aplicación', description: 'Filtra interesados con un formulario a medida.', icon: ClipboardCheck },
  { id: 'upsell', name: 'Upsell / downsell', description: 'Aumenta el valor de una compra ya hecha.', icon: ArrowUpRight },
  { id: 'custom', name: 'Funnel libre', description: 'Arma un flujo completamente personalizado.', icon: Shuffle },
];

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
  id: string;
  name: string;
  tag: string;
  description: string;
  /** Colores de la miniatura: son los de la marca del cliente de ejemplo, no los de la plataforma. */
  background: string;
  accent: string;
}

export const TEMPLATES: Template[] = [
  { id: 'claridad', name: 'Claridad', tag: 'Educación y cursos', description: 'Ideal para vender cursos y programas con inscripción directa.', background: '#EAF4F0', accent: '#0E7A63' },
  { id: 'impacto', name: 'Impacto', tag: 'Ecommerce', description: 'Alto contraste para lanzamientos y ofertas por tiempo limitado.', background: '#FAEEEA', accent: '#C8442D' },
  { id: 'minimal', name: 'Minimal', tag: 'Servicios profesionales', description: 'Diseño sobrio para consultoría, estudios y servicios 1:1.', background: '#EEEEF0', accent: '#1F2A44' },
  { id: 'encuentro', name: 'Encuentro', tag: 'Eventos', description: 'Pensada para registro a webinars y eventos en vivo.', background: '#F8F5E8', accent: '#B5860B' },
  { id: 'recurso', name: 'Recurso', tag: 'Lead magnet', description: 'Entrega un recurso gratuito a cambio de datos de contacto.', background: '#EDF3F6', accent: '#2A6F97' },
  { id: 'agenda', name: 'Agenda', tag: 'Agendar citas', description: 'Enfocada en reservar llamadas o citas desde el primer scroll.', background: '#F6EEF0', accent: '#8B2E5C' },
];

export interface SampleFunnel {
  id: string;
  name: string;
  goal: string;
  published: boolean;
  leads: number;
  updated: string;
}

export const SAMPLE_FUNNELS: SampleFunnel[] = [
  { id: 'f1', name: 'Mentoría 1:1 · Reserva tu llamada', goal: 'Agendar reuniones', published: true, leads: 38, updated: 'Hace 2 días' },
  { id: 'f2', name: 'Curso de Excel · Inscripción', goal: 'Vender un producto', published: true, leads: 124, updated: 'Hace 5 días' },
  { id: 'f3', name: 'Webinar de lanzamiento', goal: 'Webinar o evento', published: false, leads: 0, updated: 'Ayer' },
  { id: 'f4', name: 'Guía gratuita · 10 plantillas', goal: 'Lead magnet', published: false, leads: 0, updated: 'Hace 1 hora' },
];

/** Pasos del wizard (títulos y subtítulos del mockup). */
export const WIZARD_STEPS = [
  { title: 'Objetivo del funnel', hint: 'Elige qué quieres lograr' },
  { title: 'Producto y público', hint: 'Qué vendes y a quién' },
  { title: 'Plantilla', hint: 'Un punto de partida ya diseñado' },
  { title: 'Generar con IA', hint: 'Estructura, textos y CTA' },
] as const;
