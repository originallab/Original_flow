import type { BlockType, Issue } from './types';

/**
 * Catálogo de bloques: para cada tipo, qué campos tiene (los mismos que valida el backend en
 * `funnel-types/blocks.ts`), con qué contenido nace y si se puede agregar desde el editor.
 * El editor dibuja su panel de propiedades a partir de estos campos y la validación los usa tal cual.
 */

export type FieldDef =
  | { kind: 'text'; key: string; label: string; max: number; /** Largo mínimo (por defecto, uno). */ min?: number; required?: boolean; multiline?: boolean; hint?: string; pattern?: { regex: RegExp; message: string } }
  | { kind: 'url'; key: string; label: string; required?: boolean; hint?: string }
  | { kind: 'datetime'; key: string; label: string; required?: boolean }
  | { kind: 'number'; key: string; label: string; min: number; max?: number; integer?: boolean; required?: boolean; hint?: string }
  /** Varios campos que viven juntos dentro de un objeto (por ejemplo `thankYou.message`). */
  | { kind: 'group'; key: string; label: string; fields: FieldDef[]; required?: boolean }
  | { kind: 'boolean'; key: string; label: string }
  | { kind: 'select'; key: string; label: string; options: { value: string; label: string }[] }
  | {
      kind: 'list';
      key: string;
      label: string;
      /** Cómo se llama cada elemento («Beneficio», «Pregunta»…). */
      itemLabel: string;
      min: number;
      max: number;
      /** Texto simple, o un objeto con sus campos. */
      of: { kind: 'text'; max: number; /** Texto con el que nace un elemento nuevo (por defecto «Nuevo <elemento>»). */ sample?: string } | { kind: 'object'; fields: FieldDef[]; create: () => Record<string, unknown> };
      /** Solo se muestra (y se valida) si esto se cumple para el elemento que lo contiene. */
      showIf?: (parent: Record<string, unknown>) => boolean;
    };

export interface BlockDef {
  type: BlockType;
  label: string;
  description: string;
  fields: FieldDef[];
  /** Contenido con el que nace al agregarlo. */
  create: () => Record<string, unknown>;
  /** `false`: depende de subir archivos (todavía no disponible) y no se ofrece al agregar bloques. */
  addable: boolean;
  /** Reglas entre varios campos. */
  refine?: (content: Record<string, unknown>) => Issue[];
}

/** Imagen de relleno sin red (un SVG dentro de la propia dirección) para los bloques de imagen nuevos. */
export const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#e6e3ee"/><g fill="#a39db3"><rect x="400" y="200" width="160" height="110" rx="12"/><circle cx="450" cy="235" r="14" fill="#e6e3ee"/><path d="M410 300l40-40 30 28 24-18 46 30z" fill="#e6e3ee"/></g></svg>',
  );

const text = (key: string, label: string, max: number, extra: Partial<Extract<FieldDef, { kind: 'text' }>> = {}): FieldDef => ({ kind: 'text', key, label, max, ...extra });

const FORM_FIELD_TYPES = [
  { value: 'text', label: 'Texto corto' },
  { value: 'email', label: 'Correo' },
  { value: 'tel', label: 'Teléfono' },
  { value: 'textarea', label: 'Texto largo' },
  { value: 'select', label: 'Lista de opciones' },
];

/** Identificador interno de un campo nuevo: único dentro del formulario sin llevar la cuenta. */
const nextFieldName = () => `campo_${Math.random().toString(36).slice(2, 7)}`;

export const BLOCKS: Record<BlockType, BlockDef> = {
  encabezado: {
    type: 'encabezado',
    label: 'Encabezado',
    description: 'El título principal de la página, con una frase de apoyo.',
    addable: true,
    fields: [text('title', 'Título', 200, { required: true }), text('subtitle', 'Subtítulo', 400, { multiline: true })],
    create: () => ({ title: 'Título de tu página', subtitle: 'Una frase que explique tu propuesta.' }),
  },
  texto: {
    type: 'texto',
    label: 'Texto',
    description: 'Un párrafo con su título.',
    addable: true,
    fields: [text('title', 'Título', 200), text('body', 'Texto', 5000, { required: true, multiline: true })],
    create: () => ({ title: 'Sobre esto', body: 'Escribe aquí tu texto.' }),
  },
  imagen: {
    type: 'imagen',
    label: 'Imagen',
    description: 'Una imagen, con su texto alternativo.',
    addable: true,
    fields: [
      { kind: 'url', key: 'url', label: 'Dirección de la imagen', hint: 'Pega el enlace de tu imagen (subir archivos llegará más adelante).' },
      text('alt', 'Texto alternativo', 200, { hint: 'Describe la imagen para quien no la puede ver.' }),
    ],
    create: () => ({ url: PLACEHOLDER_IMAGE, alt: 'Imagen' }),
    refine: (content) => (content.url || content.fileId ? [] : [{ path: ['url'], message: 'Agrega la dirección de la imagen.' }]),
  },
  video: {
    type: 'video',
    label: 'Video',
    description: 'Un video por enlace.',
    addable: true,
    fields: [{ kind: 'url', key: 'url', label: 'Enlace del video', required: true }, text('title', 'Título', 200)],
    create: () => ({ url: 'https://example.com/video', title: 'Tu video' }),
  },
  formulario: {
    type: 'formulario',
    label: 'Formulario',
    description: 'Pide datos de contacto a quien visita la página.',
    addable: true,
    fields: [
      text('title', 'Título', 200),
      {
        kind: 'list',
        key: 'fields',
        label: 'Campos',
        itemLabel: 'Campo',
        min: 1,
        max: 30,
        of: {
          kind: 'object',
          create: () => ({ name: nextFieldName(), label: 'Nuevo campo', type: 'text', required: false }),
          fields: [
            text('label', 'Etiqueta', 120, { required: true }),
            text('name', 'Identificador interno', 40, {
              required: true,
              hint: 'Sin espacios ni acentos; empieza con una letra.',
              pattern: { regex: /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, message: 'Debe empezar con una letra y usar solo letras, números y guion bajo.' },
            }),
            { kind: 'select', key: 'type', label: 'Tipo de campo', options: FORM_FIELD_TYPES },
            { kind: 'boolean', key: 'required', label: 'Es obligatorio' },
            { kind: 'list', key: 'options', label: 'Opciones', itemLabel: 'Opción', min: 0, max: 30, of: { kind: 'text', max: 80, sample: 'Nueva opción' }, showIf: (field) => field.type === 'select' },
          ],
        },
      },
      text('submitLabel', 'Texto del botón de envío', 60, { required: true }),
    ],
    create: () => ({
      title: 'Déjanos tus datos',
      fields: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'email', label: 'Correo', type: 'email', required: true },
      ],
      submitLabel: 'Enviar',
    }),
  },
  boton: {
    type: 'boton',
    label: 'Botón',
    description: 'Un botón de llamado a la acción.',
    addable: true,
    fields: [text('label', 'Texto del botón', 80, { required: true })],
    create: () => ({ label: 'Quiero empezar' }),
  },
  contador: {
    type: 'contador',
    label: 'Cuenta regresiva',
    description: 'Un contador hasta una fecha.',
    addable: true,
    fields: [{ kind: 'datetime', key: 'endsAt', label: 'Termina el', required: true }, text('label', 'Texto', 120)],
    create: () => ({ endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(), label: 'La oferta termina en' }),
  },
  precios: {
    type: 'precios',
    label: 'Precios',
    description: 'Uno o varios planes con su precio.',
    addable: true,
    fields: [
      {
        kind: 'list',
        key: 'plans',
        label: 'Planes',
        itemLabel: 'Plan',
        min: 1,
        max: 6,
        of: {
          kind: 'object',
          create: () => ({ name: 'Plan', price: 0, features: ['Beneficio incluido'] }),
          fields: [
            text('name', 'Nombre del plan', 80, { required: true }),
            { kind: 'number', key: 'price', label: 'Precio', min: 0, required: true },
            { kind: 'list', key: 'features', label: 'Qué incluye', itemLabel: 'Elemento', min: 0, max: 30, of: { kind: 'text', max: 200 } },
          ],
        },
      },
    ],
    create: () => ({ plans: [{ name: 'Plan', price: 0, features: ['Beneficio incluido'] }] }),
  },
  testimonios: {
    type: 'testimonios',
    label: 'Testimonios',
    description: 'Lo que dicen tus clientes.',
    addable: true,
    fields: [
      {
        kind: 'list',
        key: 'items',
        label: 'Testimonios',
        itemLabel: 'Testimonio',
        min: 1,
        max: 20,
        of: {
          kind: 'object',
          create: () => ({ name: 'Nombre Apellido', quote: 'Aquí va el testimonio de un cliente.' }),
          fields: [text('name', 'Nombre', 120, { required: true }), text('quote', 'Testimonio', 1000, { required: true, multiline: true }), text('role', 'Cargo o empresa', 120)],
        },
      },
    ],
    create: () => ({ items: [{ name: 'Nombre Apellido', quote: 'Aquí va el testimonio de un cliente.' }] }),
  },
  faq: {
    type: 'faq',
    label: 'Preguntas frecuentes',
    description: 'Preguntas y respuestas.',
    addable: true,
    fields: [
      {
        kind: 'list',
        key: 'items',
        label: 'Preguntas',
        itemLabel: 'Pregunta',
        min: 1,
        max: 30,
        of: {
          kind: 'object',
          create: () => ({ question: '¿Nueva pregunta?', answer: 'Escribe la respuesta.' }),
          fields: [text('question', 'Pregunta', 300, { required: true }), text('answer', 'Respuesta', 2000, { required: true, multiline: true })],
        },
      },
    ],
    create: () => ({ items: [{ question: '¿Pregunta frecuente?', answer: 'Escribe la respuesta.' }] }),
  },
  logos: {
    type: 'logos',
    label: 'Logos',
    description: 'Logos de clientes o aliados (necesita subir archivos).',
    addable: false,
    fields: [],
    create: () => ({ fileIds: [] }),
  },
  beneficios: {
    type: 'beneficios',
    label: 'Beneficios',
    description: 'Lo que gana quien compra o se registra.',
    addable: true,
    fields: [
      text('title', 'Título', 200),
      {
        kind: 'list',
        key: 'items',
        label: 'Beneficios',
        itemLabel: 'Beneficio',
        min: 1,
        max: 12,
        of: { kind: 'object', create: () => ({ title: 'Nuevo beneficio', description: 'Explica cómo ayuda.' }), fields: [text('title', 'Título', 200, { required: true }), text('description', 'Descripción', 600, { multiline: true })] },
      },
    ],
    create: () => ({ title: 'Lo que obtienes', items: [{ title: 'Beneficio', description: 'Descripción.' }] }),
  },
  calendario: {
    type: 'calendario',
    label: 'Calendario',
    description: 'Para reservar una cita.',
    addable: true,
    fields: [text('title', 'Título', 200), { kind: 'url', key: 'url', label: 'Enlace de tu calendario' }],
    create: () => ({ title: 'Elige tu horario' }),
  },
  agenda: {
    type: 'agenda',
    label: 'Agenda',
    description: 'El programa de un evento.',
    addable: true,
    fields: [
      {
        kind: 'list',
        key: 'items',
        label: 'Temas',
        itemLabel: 'Tema',
        min: 1,
        max: 30,
        of: { kind: 'object', create: () => ({ title: 'Nuevo tema', time: '00:00' }), fields: [text('title', 'Tema', 200, { required: true }), text('time', 'Hora', 40), text('speaker', 'Quién lo presenta', 120)] },
      },
    ],
    create: () => ({ items: [{ title: 'Tema', time: '10:00' }] }),
  },
  requisitos: {
    type: 'requisitos',
    label: 'Requisitos',
    description: 'Lo que se necesita para aplicar.',
    addable: true,
    fields: [{ kind: 'list', key: 'items', label: 'Requisitos', itemLabel: 'Requisito', min: 1, max: 30, of: { kind: 'text', max: 300 } }],
    create: () => ({ items: ['Primer requisito'] }),
  },
};

/** Los tipos que el editor ofrece al agregar un bloque. */
export const ADDABLE_BLOCKS = Object.values(BLOCKS).filter((def) => def.addable);
