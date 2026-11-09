import type { FunnelObjective } from '@/services/funnels';
import { PLACEHOLDER_IMAGE } from '@/shared/blocks/catalog';
import type { Block, BlockType } from '@/shared/blocks/types';
import { goalOf, templateOf } from '../catalog';
import { parsePrice } from './briefToFunnel';
import type { GeneratedPage, GenerationInput, PageGenerator } from './types';

/** Los bloques base de cada tipo de funnel (los mismos que define el backend en `funnel-types/index.ts`). */
const BASE_BLOCKS: Record<FunnelObjective, BlockType[]> = {
  leads: ['encabezado', 'beneficios', 'testimonios', 'formulario', 'faq'],
  venta: ['encabezado', 'beneficios', 'testimonios', 'precios', 'faq', 'boton'],
  citas: ['encabezado', 'beneficios', 'formulario', 'calendario'],
  magnet: ['encabezado', 'imagen', 'formulario'],
  webinar: ['encabezado', 'agenda', 'formulario'],
  aplicacion: ['encabezado', 'requisitos', 'formulario'],
  upsell: [],
  libre: [],
};

/** Recorta al largo permitido por el bloque (el backend rechaza lo que se pase). */
const clip = (value: string, max: number) => value.trim().slice(0, max);
const first = (...values: string[]) => values.map((v) => v.trim()).find((v) => v !== '') ?? '';

const campo = (name: string, label: string, type: string, required = false) => ({ name, label, type, required });

/** El formulario de cada tipo: sus campos, su título y el texto del botón por defecto. */
const FORMS: Partial<Record<FunnelObjective, { title: string; submit: string; fields: ReturnType<typeof campo>[] }>> = {
  leads: { title: 'Déjanos tus datos', submit: 'Quiero más información', fields: [campo('nombre', 'Nombre', 'text', true), campo('email', 'Correo', 'email', true), campo('telefono', 'Teléfono', 'tel')] },
  citas: {
    title: 'Reserva tu llamada',
    submit: 'Reservar mi lugar',
    fields: [campo('nombre', 'Nombre', 'text', true), campo('email', 'Correo', 'email', true), campo('telefono', 'Teléfono', 'tel', true), campo('mensaje', '¿Algo que debamos saber?', 'textarea')],
  },
  magnet: { title: 'Recibe tu recurso gratis', submit: 'Descargar ahora', fields: [campo('nombre', 'Nombre', 'text', true), campo('email', 'Correo', 'email', true)] },
  webinar: { title: 'Regístrate al evento', submit: 'Reservar mi lugar', fields: [campo('nombre', 'Nombre', 'text', true), campo('email', 'Correo', 'email', true)] },
  aplicacion: {
    title: 'Aplica ahora',
    submit: 'Enviar mi aplicación',
    fields: [campo('nombre', 'Nombre', 'text', true), campo('email', 'Correo', 'email', true), campo('telefono', 'Teléfono', 'tel'), campo('motivo', '¿Por qué quieres aplicar?', 'textarea', true)],
  },
};

/** El contenido de cada bloque, armado con lo que la persona escribió (o con un texto de ejemplo para completar). */
function contentFor(type: BlockType, input: GenerationInput): Record<string, unknown> {
  const { brief, objective, workspace } = input;
  const goal = goalOf(objective);
  const business = workspace.name;
  const form = FORMS[objective];

  switch (type) {
    case 'encabezado': {
      const title = first(brief.result, brief.name, brief.offer, `Conoce ${business}`);
      const subtitle = first(brief.offer.trim() === title ? '' : brief.offer, brief.audience ? `Pensado para ${brief.audience}` : '', 'Descubre cómo podemos ayudarte.');
      return { title: clip(title, 200), subtitle: clip(subtitle, 400) };
    }
    case 'beneficios':
      return {
        title: 'Lo que obtienes',
        items: [
          { title: clip(first(brief.result, 'Resultados que se notan'), 200), description: clip(first(brief.offer, 'Explica en una frase cómo te ayuda tu producto.'), 600) },
          { title: 'Pensado para ti', description: clip(first(brief.audience, 'Cuenta a quién va dirigido y qué problema resuelve.'), 600) },
          { title: 'Sin complicaciones', description: 'Un proceso claro, paso a paso, para que empieces hoy.' },
        ],
      };
    case 'testimonios':
      return {
        items: [
          { name: 'Nombre Apellido', quote: 'Aquí va el testimonio de un cliente satisfecho: qué logró y cómo se sintió.', role: 'Cargo o empresa' },
          { name: 'Otra Persona', quote: 'Un segundo testimonio ayuda a generar confianza.', role: 'Cargo o empresa' },
        ],
      };
    case 'formulario':
      return { title: form?.title ?? 'Déjanos tus datos', fields: (form?.fields ?? [campo('nombre', 'Nombre', 'text', true), campo('email', 'Correo', 'email', true)]).map((f) => ({ ...f })), submitLabel: clip(first(brief.cta, form?.submit ?? 'Enviar'), 60) };
    case 'faq':
      return {
        items: [
          { question: '¿Para quién es?', answer: clip(first(brief.audience, 'Cuenta aquí a quién va dirigido.'), 2000) },
          { question: '¿Cuánto cuesta?', answer: clip(first(brief.price, 'Escribe aquí el precio o cómo se contrata.'), 2000) },
          { question: '¿Qué pasa después?', answer: 'Te contactamos para acompañarte en el siguiente paso.' },
        ],
      };
    case 'precios':
      return { plans: [{ name: clip(first(brief.name, 'Plan'), 80), price: parsePrice(brief.price)?.amount ?? 0, features: [clip(first(brief.result, 'Acceso inmediato'), 200), 'Soporte incluido'] }] };
    case 'boton':
      return { label: clip(first(brief.cta, 'Comprar ahora'), 80) };
    case 'calendario':
      return { title: 'Elige tu horario' };
    case 'imagen':
      return { url: PLACEHOLDER_IMAGE, alt: clip(`Portada de ${first(brief.name, goal.name)}`, 200) };
    case 'agenda':
      return {
        items: [
          { time: '10:00', title: 'Bienvenida y objetivos' },
          { time: '10:15', title: 'Contenido principal' },
          { time: '11:00', title: 'Preguntas y respuestas' },
        ],
      };
    case 'requisitos':
      return { items: ['Describe aquí el primer requisito', 'Describe aquí el segundo requisito'] };
    default:
      return {};
  }
}

/**
 * Arma la página sin IA: la plantilla elegida, los bloques base del tipo de funnel, y los textos
 * tomados de lo que la persona escribió (lo que falte queda como texto de ejemplo para editar).
 * La paleta es la de la marca del negocio; si todavía no la definió, la de la plantilla.
 * El tono y las instrucciones adicionales los usará la IA cuando se conecte.
 */
export function buildPage(input: GenerationInput): GeneratedPage {
  const template = templateOf(input.templateId);
  const blocks: Block[] = BASE_BLOCKS[input.objective].map((type, index) => ({
    key: type,
    type,
    order: index + 1,
    content: contentFor(type, input),
    style: {},
  }));
  return { designSpec: { template: template.id, palette: input.workspace.brandPalette ?? template.palette }, blocks };
}

export const templateGenerator: PageGenerator = {
  id: 'template',
  generate: async (input) => buildPage(input),
};
