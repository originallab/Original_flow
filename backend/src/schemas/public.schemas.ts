import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

const MAX_CUSTOM_FIELDS = 30;

/** Parámetros UTM y referente: solo estos cuatro, el resto se descarta. */
const utmSchema = z
  .object({
    utm_source: text(100).optional(),
    utm_medium: text(100).optional(),
    utm_campaign: text(100).optional(),
    referrer: text(300).optional(),
  })
  .default({});

/** Respuestas de campos del formulario: nombres seguros (sin guion bajo inicial: es de uso interno) y valores simples. */
const customFieldsSchema = z
  .record(
    z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, 'el nombre del campo debe empezar con letra y usar letras, números y guion bajo'),
    z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]),
  )
  .refine((fields) => Object.keys(fields).length <= MAX_CUSTOM_FIELDS, `máximo ${MAX_CUSTOM_FIELDS} campos`)
  .default({});

/**
 * POST /public/funnels/:slug/leads. Exige consentimiento. Lo que no está aquí (funnelId,
 * etapa, fuente...) se ignora: el visitante nunca decide a dónde va el lead.
 */
export const leadBodySchema = z
  .object({
    name: text(200).optional(),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)).optional(),
    phone: z.string().trim().regex(/^[0-9+()\-.\s]{6,30}$/, 'teléfono no válido').optional(),
    consent: z.literal(true, { error: 'debe aceptar el tratamiento de sus datos' }),
    utm: utmSchema,
    customFields: customFieldsSchema,
  })
  .superRefine((body, ctx) => {
    if (!body.email && !body.phone) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'debe incluir email o phone' });
    }
  });
export type LeadBody = z.infer<typeof leadBodySchema>;

/** Eventos que puede mandar el navegador. El resto (lead_created, pagos...) los genera solo el servidor. */
export const CLIENT_EVENT_TYPES = ['page_view', 'section_view', 'button_click'] as const;

const MAX_EVENTS_PER_BATCH = 20;

const eventSchema = z.object({
  type: z.enum(CLIENT_EVENT_TYPES),
  // Solo estas propiedades; cualquier otra se descarta, para que nadie meta datos arbitrarios.
  properties: z
    .object({
      source: text(100).optional(),
      section: text(100).optional(),
      blockKey: text(50).optional(),
    })
    .default({}),
});

/** POST /public/funnels/:slug/events */
export const eventsBodySchema = z.object({ events: z.array(eventSchema).min(1).max(MAX_EVENTS_PER_BATCH) });
export type EventsBody = z.infer<typeof eventsBodySchema>;

export const slugParamsSchema = z.object({ slug: z.string().min(1).max(100) });
