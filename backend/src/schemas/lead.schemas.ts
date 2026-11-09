import { z } from 'zod';
import { paginationQuerySchema } from '../lib/pagination.js';
import { customFieldsSchema, emailSchema, phoneSchema } from './public.schemas.js';

const text = (max: number) => z.string().trim().min(1).max(max);

/** El tope del valor estimado (la columna es `Decimal(12, 2)`). */
export const MAX_LEAD_VALUE = 9_999_999_999.99;

const valueSchema = z.number().min(0).max(MAX_LEAD_VALUE);

export const leadIdParamsSchema = z.object({ id: z.uuid() });
export const stageIdParamsSchema = z.object({ id: z.uuid() });

export const LEAD_SOURCES = ['web_form', 'whatsapp'] as const;

/** GET /leads: el negocio y filtros opcionales; `q` busca en nombre, correo y teléfono. */
export const listLeadsQuerySchema = paginationQuerySchema.extend({
  workspaceId: z.uuid(),
  funnelId: z.uuid().optional(),
  stageId: z.uuid().optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

/** POST /leads: alta manual. Lleva al menos un correo o un teléfono; sin etapa, entra a la primera del tablero. */
export const createLeadBodySchema = z
  .object({
    funnelId: z.uuid(),
    leadStageId: z.uuid().optional(),
    name: text(200).optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    value: valueSchema.optional(),
    source: z.enum(LEAD_SOURCES).optional(),
    customFields: customFieldsSchema,
  })
  .superRefine((body, ctx) => {
    if (!body.email && !body.phone) ctx.addIssue({ code: 'custom', path: ['email'], message: 'debe incluir email o phone' });
  });
export type CreateLeadBody = z.infer<typeof createLeadBodySchema>;

/** PATCH /leads/:id: todos opcionales, pero al menos uno. Con `null` se borra el valor, el vendedor, el nombre, el correo o el teléfono. */
export const updateLeadBodySchema = z
  .object({
    leadStageId: z.uuid(),
    assignedTo: z.uuid().nullable(),
    name: text(200).nullable(),
    email: emailSchema.nullable(),
    phone: phoneSchema.nullable(),
    value: valueSchema.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'debe enviar al menos un campo');
export type UpdateLeadBody = z.infer<typeof updateLeadBodySchema>;

/** POST /workspaces/:id/lead-stages: el nombre y, si se quiere, la posición (1 es la primera). */
export const createStageBodySchema = z.object({ name: text(60), order: z.number().int().min(1).max(100).optional() });
export type CreateStageBody = z.infer<typeof createStageBodySchema>;

/** PATCH /lead-stages/:id: renombra, reordena o ambas; al menos una. */
export const updateStageBodySchema = z
  .object({ name: text(60), order: z.number().int().min(1).max(100) })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'debe enviar al menos un campo');
export type UpdateStageBody = z.infer<typeof updateStageBodySchema>;
