import { z } from 'zod';
import { BLOCK_TYPES, validateBlockContent } from '../funnel-types/blocks.js';
import { paginationQuerySchema } from '../lib/pagination.js';
import { SLUG_PATTERN } from '../lib/slug.js';

const text = (max: number) => z.string().trim().min(1).max(max);

export const CURRENCIES = ['MXN', 'USD', 'CLP'] as const;
export const OBJECTIVES = ['leads', 'venta', 'citas', 'magnet', 'webinar', 'aplicacion', 'upsell', 'libre'] as const;

export const funnelIdParamsSchema = z.object({ id: z.uuid() });
export const blockParamsSchema = z.object({ id: z.uuid(), key: z.string().min(1).max(50) });
export const ctaParamsSchema = z.object({ id: z.uuid(), blockKey: z.string().min(1).max(50) });

const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(60)
  .regex(SLUG_PATTERN, 'debe usar minúsculas, números y guiones, por ejemplo mi-curso-de-datos');

/** GET /funnels */
export const listFunnelsQuerySchema = paginationQuerySchema.extend({
  workspaceId: z.uuid(),
  status: z.enum(['draft', 'published']).optional(),
});
export type ListFunnelsQuery = z.infer<typeof listFunnelsQuerySchema>;

/** POST /funnels: datos de los pasos 1 y 2 del wizard. */
export const createFunnelBodySchema = z.object({
  workspaceId: z.uuid(),
  name: text(120),
  objective: z.enum(OBJECTIVES),
  productName: text(200).optional(),
  price: z.number().min(0).max(9_999_999_999).optional(),
  currency: z.enum(CURRENCIES).optional(),
  targetAudience: text(300).optional(),
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'debe ser un código de idioma como es o es-MX').optional(),
});
export type CreateFunnelBody = z.infer<typeof createFunnelBodySchema>;

const seoSchema = z.object({
  title: text(120).optional(),
  description: text(320).optional(),
  indexable: z.boolean().optional(),
});

/** PATCH /funnels/:id: todos opcionales, pero al menos uno. */
export const updateFunnelBodySchema = z
  .object({
    name: text(120),
    productName: text(200).nullable(),
    price: z.number().min(0).max(9_999_999_999).nullable(),
    currency: z.enum(CURRENCIES),
    targetAudience: text(300).nullable(),
    slug: slugSchema,
    seo: seoSchema.nullable(),
    language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'debe enviar al menos un campo');
export type UpdateFunnelBody = z.infer<typeof updateFunnelBodySchema>;

/** Un bloque de la página. Su `content` se valida según su `type` (ver funnel-types/blocks.ts). */
export const blockSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,49}$/, 'debe usar minúsculas, números, guion o guion bajo (máx. 50)'),
  type: z.enum(BLOCK_TYPES),
  order: z.number().int().min(1).max(1000),
  content: z.record(z.string(), z.unknown()),
  style: z.record(z.string(), z.unknown()).default({}),
});
export type Block = z.infer<typeof blockSchema>;

const MAX_BLOCKS = 60;

/** PUT /funnels/:id/content */
export const contentBodySchema = z
  .object({ blocks: z.array(blockSchema).max(MAX_BLOCKS) })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.blocks.forEach((block, index) => {
      if (seen.has(block.key)) {
        ctx.addIssue({ code: 'custom', path: ['blocks', index, 'key'], message: `la clave "${block.key}" está repetida` });
      }
      seen.add(block.key);
      for (const issue of validateBlockContent(block.type, block.content)) {
        ctx.addIssue({ code: 'custom', path: ['blocks', index, 'content', ...issue.path], message: issue.message });
      }
    });
  });

/** PATCH /funnels/:id/content/blocks/:key: cambia contenido, estilo u orden; el tipo no se cambia. */
export const patchBlockBodySchema = z
  .object({
    content: z.record(z.string(), z.unknown()),
    style: z.record(z.string(), z.unknown()),
    order: z.number().int().min(1).max(1000),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'debe enviar al menos un campo');
export type PatchBlockBody = z.infer<typeof patchBlockBodySchema>;

/** PUT /funnels/:id/type-config: la forma exacta depende del tipo de funnel. */
export const typeConfigBodySchema = z.record(z.string(), z.unknown());

/** PATCH /funnels/:id/ctas/:blockKey */
export const patchCtaBodySchema = z
  .object({
    actionType: z.enum(['url', 'form_submit', 'scroll_to', 'checkout']),
    destination: text(500).nullable(),
    trackingId: text(100).nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'debe enviar al menos un campo');
export type PatchCtaBody = z.infer<typeof patchCtaBodySchema>;
