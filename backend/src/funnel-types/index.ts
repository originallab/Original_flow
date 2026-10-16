import { z } from 'zod';
import type { CtaActionType, FunnelObjective } from '../generated/prisma/client.js';
import type { BlockType } from './blocks.js';

/**
 * Registro de tipos de funnel (definiciones en código, no una tabla): qué bloques lleva
 * cada uno, su llamado a la acción principal, el esquema de `typeConfig`, qué evento
 * cuenta como conversión y si cobra. Agregar un tipo es agregar una entrada aquí, sin
 * tocar la base de datos.
 */
export interface FunnelTypeDef {
  id: FunnelObjective;
  name: string;
  description: string;
  /** `false` = todavía no se puede crear (necesita varias páginas por funnel). */
  available: boolean;
  /** Si cobra con Original Pay dentro de la página. */
  charges: boolean;
  primaryCta: CtaActionType | null;
  conversionEvent: string | null;
  baseBlocks: BlockType[];
  typeConfigSchema: z.ZodType;
}

const text = (max: number) => z.string().trim().min(1).max(max);

const noConfig = z.object({});

export const FUNNEL_TYPES: Record<FunnelObjective, FunnelTypeDef> = {
  leads: {
    id: 'leads',
    name: 'Captar contactos',
    description: 'Una página con formulario para conseguir leads.',
    available: true,
    charges: false,
    primaryCta: 'form_submit',
    conversionEvent: 'lead_created',
    baseBlocks: ['encabezado', 'beneficios', 'testimonios', 'formulario', 'faq'],
    typeConfigSchema: z.object({
      thankYou: z.object({ message: text(500), redirectUrl: z.url().optional() }),
    }),
  },
  venta: {
    id: 'venta',
    name: 'Vender un producto',
    description: 'Una página que cobra dentro de la misma página con Original Pay.',
    available: true,
    charges: true,
    primaryCta: 'checkout',
    conversionEvent: 'payment_completed',
    baseBlocks: ['encabezado', 'beneficios', 'testimonios', 'precios', 'faq', 'boton'],
    // El precio y la divisa viven en Funnel.price y Funnel.currency (única fuente de verdad);
    // aquí solo va lo demás de la oferta.
    typeConfigSchema: z.object({
      offer: z.object({ compareAtPrice: z.number().positive().optional() }).default({}),
      paymentMethods: z.array(text(40)).min(1).max(10),
      successMessage: text(500),
      successUrl: z.url().optional(),
    }),
  },
  citas: {
    id: 'citas',
    name: 'Agendar una reunión',
    description: 'Formulario y calendario para reservar una cita.',
    available: true,
    charges: false,
    primaryCta: 'form_submit',
    conversionEvent: 'lead_created',
    baseBlocks: ['encabezado', 'beneficios', 'formulario', 'calendario'],
    typeConfigSchema: z.object({
      calendarUrl: z.url(),
      durationMin: z.number().int().min(5).max(480),
      confirmationMessage: text(500),
    }),
  },
  magnet: {
    id: 'magnet',
    name: 'Entregar un recurso',
    description: 'Un recurso descargable a cambio de los datos de contacto.',
    available: true,
    charges: false,
    primaryCta: 'form_submit',
    conversionEvent: 'lead_created',
    baseBlocks: ['encabezado', 'imagen', 'formulario'],
    typeConfigSchema: z.object({ resourceFileId: text(200), deliveryMessage: text(500) }),
  },
  webinar: {
    id: 'webinar',
    name: 'Registrar a un evento',
    description: 'Registro a un webinar o evento con fecha y agenda.',
    available: true,
    charges: false,
    primaryCta: 'form_submit',
    conversionEvent: 'lead_created',
    baseBlocks: ['encabezado', 'agenda', 'formulario'],
    typeConfigSchema: z.object({
      startsAt: z.iso.datetime({ offset: true }),
      timezone: text(60),
      joinUrl: z.url(),
      agenda: z.array(z.object({ time: text(40).optional(), title: text(200) })).max(30).default([]),
    }),
  },
  aplicacion: {
    id: 'aplicacion',
    name: 'Recibir postulaciones',
    description: 'Un formulario largo para postulaciones o aplicaciones.',
    available: true,
    charges: false,
    primaryCta: 'form_submit',
    conversionEvent: 'lead_created',
    baseBlocks: ['encabezado', 'requisitos', 'formulario'],
    typeConfigSchema: z
      .object({
        questions: z
          .array(
            z.object({
              id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'debe empezar con letra minúscula y usar solo minúsculas, números y guion bajo'),
              label: text(300),
              type: z.enum(['text', 'textarea', 'select', 'yesno']),
              required: z.boolean().default(false),
              options: z.array(text(80)).max(30).optional(),
            }),
          )
          .min(1)
          .max(40),
        successMessage: text(500),
      })
      .refine((c) => new Set(c.questions.map((q) => q.id)).size === c.questions.length, {
        message: 'los ids de las preguntas no se pueden repetir',
        path: ['questions'],
      }),
  },
  upsell: {
    id: 'upsell',
    name: 'Oferta después de una compra',
    description: 'Oferta posterior a una compra. Requiere varias páginas por funnel (próximamente).',
    available: false,
    charges: true,
    primaryCta: 'checkout',
    conversionEvent: 'payment_completed',
    baseBlocks: ['texto', 'boton'],
    typeConfigSchema: noConfig,
  },
  libre: {
    id: 'libre',
    name: 'Flujo propio',
    description: 'Un flujo armado libremente (próximamente).',
    available: false,
    charges: false,
    primaryCta: null,
    conversionEvent: null,
    baseBlocks: [],
    typeConfigSchema: noConfig,
  },
};

export function getFunnelType(objective: FunnelObjective): FunnelTypeDef {
  return FUNNEL_TYPES[objective];
}

/** Lo que devuelve `GET /funnel-types` (el esquema de `typeConfig` va como JSON Schema). */
export function describeFunnelTypes() {
  return Object.values(FUNNEL_TYPES).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    available: t.available,
    charges: t.charges,
    primaryCta: t.primaryCta,
    conversionEvent: t.conversionEvent,
    baseBlocks: t.baseBlocks,
    typeConfigSchema: z.toJSONSchema(t.typeConfigSchema, { unrepresentable: 'any' }),
  }));
}
