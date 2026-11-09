import type { FunnelObjective } from '@/services/funnels';
import type { FieldDef } from './blocks/catalog';
import type { Issue } from './blocks/types';
import { validateFields } from './blocks/validate';

/**
 * Los tipos de funnel y los ajustes (`typeConfig`) que pide cada uno, con las mismas reglas que el
 * registro del backend (`backend/src/funnel-types/index.ts`). Los campos usan el mismo formato que
 * los bloques, así que el panel de ajustes se dibuja y se valida igual que el de un bloque.
 */
export interface FunnelTypeDef {
  id: FunnelObjective;
  available: boolean;
  /** Si cobra con Original Pay dentro de la página. */
  charges: boolean;
  /** La acción principal de su llamado a la acción. */
  primaryCta: 'form_submit' | 'checkout' | null;
  /** Los campos de sus ajustes. */
  fields: FieldDef[];
  /** Con qué valores conviene empezar (puede quedar incompleto: lo que falte lo escribe la persona). */
  initial: () => Record<string, unknown>;
  /** Reglas entre varios campos. */
  refine?: (config: Record<string, unknown>) => Issue[];
}

const text = (key: string, label: string, max: number, extra: Partial<Extract<FieldDef, { kind: 'text' }>> = {}): FieldDef => ({ kind: 'text', key, label, max, ...extra });

const QUESTION_TYPES = [
  { value: 'text', label: 'Texto corto' },
  { value: 'textarea', label: 'Texto largo' },
  { value: 'select', label: 'Lista de opciones' },
  { value: 'yesno', label: 'Sí o no' },
];

export const FUNNEL_TYPES: Record<FunnelObjective, FunnelTypeDef> = {
  leads: {
    id: 'leads',
    available: true,
    charges: false,
    primaryCta: 'form_submit',
    fields: [
      {
        kind: 'group',
        key: 'thankYou',
        label: 'Después de enviar el formulario',
        required: true,
        fields: [
          text('message', 'Mensaje de agradecimiento', 500, { required: true, multiline: true }),
          { kind: 'url', key: 'redirectUrl', label: 'Enlace al que enviar después (opcional)', hint: 'Si lo dejas vacío, solo se muestra el mensaje.' },
        ],
      },
    ],
    initial: () => ({ thankYou: { message: '¡Gracias! Recibimos tus datos y te contactaremos muy pronto.' } }),
  },
  venta: {
    id: 'venta',
    available: true,
    charges: true,
    primaryCta: 'checkout',
    fields: [
      { kind: 'group', key: 'offer', label: 'Oferta', fields: [{ kind: 'number', key: 'compareAtPrice', label: 'Precio antes del descuento (opcional)', min: 0.01 }] },
      { kind: 'list', key: 'paymentMethods', label: 'Formas de pago que aceptas', itemLabel: 'Forma de pago', min: 1, max: 10, of: { kind: 'text', max: 40, sample: 'Tarjeta de crédito o débito' } },
      text('successMessage', 'Mensaje después de comprar', 500, { required: true, multiline: true }),
      { kind: 'url', key: 'successUrl', label: 'Enlace al que enviar después de comprar (opcional)' },
    ],
    initial: () => ({ offer: {}, paymentMethods: ['Tarjeta de crédito o débito'], successMessage: '¡Gracias por tu compra!' }),
  },
  citas: {
    id: 'citas',
    available: true,
    charges: false,
    primaryCta: 'form_submit',
    fields: [
      { kind: 'url', key: 'calendarUrl', label: 'Enlace de tu calendario', required: true, hint: 'Donde la persona elige su horario.' },
      { kind: 'number', key: 'durationMin', label: 'Duración de la cita (minutos)', min: 5, max: 480, integer: true, required: true },
      text('confirmationMessage', 'Mensaje de confirmación', 500, { required: true, multiline: true }),
    ],
    initial: () => ({ durationMin: 30, confirmationMessage: '¡Listo! Tu cita quedó reservada. Te esperamos.' }),
  },
  magnet: {
    id: 'magnet',
    available: true,
    charges: false,
    primaryCta: 'form_submit',
    fields: [
      text('resourceFileId', 'Archivo del recurso', 200, { required: true, hint: 'Identificador del archivo. Subir archivos llegará más adelante.' }),
      text('deliveryMessage', 'Mensaje al entregar el recurso', 500, { required: true, multiline: true }),
    ],
    initial: () => ({ deliveryMessage: '¡Gracias! Aquí tienes tu recurso.' }),
  },
  webinar: {
    id: 'webinar',
    available: true,
    charges: false,
    primaryCta: 'form_submit',
    fields: [
      { kind: 'datetime', key: 'startsAt', label: 'Empieza el', required: true },
      text('timezone', 'Zona horaria', 60, { required: true, hint: 'Por ejemplo America/Mexico_City.' }),
      { kind: 'url', key: 'joinUrl', label: 'Enlace para entrar al evento', required: true },
      {
        kind: 'list',
        key: 'agenda',
        label: 'Agenda',
        itemLabel: 'Tema',
        min: 0,
        max: 30,
        of: { kind: 'object', create: () => ({ title: 'Nuevo tema' }), fields: [text('time', 'Hora', 40), text('title', 'Tema', 200, { required: true })] },
      },
    ],
    initial: () => ({ startsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(), timezone: safeTimezone(), agenda: [] }),
  },
  aplicacion: {
    id: 'aplicacion',
    available: true,
    charges: false,
    primaryCta: 'form_submit',
    fields: [
      {
        kind: 'list',
        key: 'questions',
        label: 'Preguntas de la aplicación',
        itemLabel: 'Pregunta',
        min: 1,
        max: 40,
        of: {
          kind: 'object',
          create: () => ({ id: `pregunta_${Math.random().toString(36).slice(2, 6)}`, label: 'Nueva pregunta', type: 'text', required: false }),
          fields: [
            text('label', 'Pregunta', 300, { required: true }),
            text('id', 'Identificador interno', 40, {
              required: true,
              hint: 'Minúsculas, números y guion bajo; empieza con una letra.',
              pattern: { regex: /^[a-z][a-z0-9_]{0,39}$/, message: 'Debe empezar con una letra minúscula y usar solo minúsculas, números y guion bajo.' },
            }),
            { kind: 'select', key: 'type', label: 'Tipo de respuesta', options: QUESTION_TYPES },
            { kind: 'boolean', key: 'required', label: 'Es obligatoria' },
            { kind: 'list', key: 'options', label: 'Opciones', itemLabel: 'Opción', min: 0, max: 30, of: { kind: 'text', max: 80, sample: 'Nueva opción' }, showIf: (question) => question.type === 'select' },
          ],
        },
      },
      text('successMessage', 'Mensaje al enviar la aplicación', 500, { required: true, multiline: true }),
    ],
    initial: () => ({
      questions: [{ id: 'motivo', label: '¿Por qué quieres aplicar?', type: 'textarea', required: true }],
      successMessage: 'Recibimos tu aplicación. Te avisaremos pronto.',
    }),
    refine: (config) => {
      const ids = Array.isArray(config.questions) ? config.questions.map((q) => (typeof q === 'object' && q !== null ? (q as Record<string, unknown>).id : undefined)) : [];
      return new Set(ids).size === ids.length ? [] : [{ path: ['questions'], message: 'Los identificadores de las preguntas no se pueden repetir.' }];
    },
  },
  upsell: { id: 'upsell', available: false, charges: true, primaryCta: 'checkout', fields: [], initial: () => ({}) },
  libre: { id: 'libre', available: false, charges: false, primaryCta: null, fields: [], initial: () => ({}) },
};

function safeTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Problemas de los ajustes de un tipo de funnel (vacío si están completos y son válidos). Las rutas son relativas a los ajustes. */
export function validateTypeConfig(objective: FunnelObjective, config: unknown): Issue[] {
  const def = FUNNEL_TYPES[objective];
  const issues = validateFields(def.fields, config ?? {});
  if (issues.length === 0 && def.refine && typeof config === 'object' && config !== null) issues.push(...def.refine(config as Record<string, unknown>));
  return issues;
}
