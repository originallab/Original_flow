import { z } from 'zod';
import { blockSchema, designSpecBodySchema } from './funnel.schemas.js';

const instruction = z.string().trim().min(1).max(500);

const detail = z.string().trim().min(1).max(500);

/** Lo que la persona escribió en el asistente y no vive en el funnel: se le pasa a la IA como información. */
export const generateBriefSchema = z.object({
  result: detail.optional(),
  objections: detail.optional(),
  tone: detail.optional(),
  callToAction: detail.optional(),
  extra: detail.optional(),
});

/** POST /funnels/:id/generate: el brief del asistente y una indicación opcional de la persona («más corto», «tono formal»...). */
export const MAX_PAGE_IMAGES = 6;

/** `images`: ids de imágenes que la persona subió (`POST /assets`); la IA las integra en la página. */
export const generateBodySchema = z.object({
  instruction: instruction.optional(),
  brief: generateBriefSchema.optional(),
  images: z.array(z.uuid()).max(MAX_PAGE_IMAGES).optional(),
});
export type GenerateBody = z.infer<typeof generateBodySchema>;

/** POST /funnels/:id/content/blocks/:key/regenerate */
export const regenerateBodySchema = z.object({ instruction: instruction.optional() });
export type RegenerateBody = z.infer<typeof regenerateBodySchema>;

export const regenerateParamsSchema = z.object({ id: z.uuid(), key: blockSchema.shape.key });

/**
 * Lo que debe devolver el motor al generar una página. Se valida con las mismas reglas que el editor:
 * si la IA devuelve un bloque inválido, no se guarda nada. El servicio vuelve a validar los bloques juntos con
 * `contentBodySchema` (claves únicas y contenido de cada tipo).
 */
export const generatedPageSchema = z.object({
  designSpec: designSpecBodySchema.optional(),
  seo: z
    .object({ title: z.string().trim().min(1).max(120).optional(), description: z.string().trim().min(1).max(320).optional() })
    .optional(),
  blocks: z.array(blockSchema).max(60),
});
export type GeneratedPage = z.infer<typeof generatedPageSchema>;
