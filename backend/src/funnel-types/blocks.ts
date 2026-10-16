import { z } from 'zod';

/**
 * Catálogo de bloques que puede llevar una página (`Funnel.content.blocks`). Cada tipo
 * valida la forma de su `content`. Los objetos son "sueltos" (`looseObject`): exigen los
 * campos conocidos pero conservan los que el editor agregue, para no perder datos mientras
 * el diseño de cada bloque evoluciona.
 */
export const BLOCK_TYPES = [
  'encabezado',
  'texto',
  'imagen',
  'video',
  'formulario',
  'boton',
  'contador',
  'precios',
  'testimonios',
  'faq',
  'logos',
  'beneficios',
  'calendario',
  'agenda',
  'requisitos',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);

const formField = z.looseObject({
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, 'debe empezar con letra y usar solo letras, números y guion bajo'),
  label: text(120),
  type: z.enum(['text', 'email', 'tel', 'textarea', 'select']),
  required: z.boolean().default(false),
  options: z.array(text(80)).max(30).optional(),
});

const CONTENT_SCHEMAS: Record<BlockType, z.ZodType> = {
  encabezado: z.looseObject({ title: text(200), subtitle: text(400).optional(), imageFileId: text(200).optional() }),
  texto: z.looseObject({ title: text(200).optional(), body: text(5000) }),
  imagen: z
    .looseObject({ fileId: text(200).optional(), url: z.url().optional(), alt: text(200).optional() })
    .refine((c) => Boolean(c.fileId ?? c.url), { message: 'debe llevar fileId o url' }),
  video: z.looseObject({ url: z.url(), title: text(200).optional() }),
  formulario: z.looseObject({
    title: text(200).optional(),
    fields: z.array(formField).min(1).max(30),
    submitLabel: text(60),
  }),
  boton: z.looseObject({ label: text(80) }),
  contador: z.looseObject({ endsAt: z.iso.datetime({ offset: true }), label: text(120).optional() }),
  precios: z.looseObject({
    plans: z
      .array(
        z.looseObject({
          name: text(80),
          price: z.number().min(0),
          features: z.array(text(200)).max(30).default([]),
        }),
      )
      .min(1)
      .max(6),
  }),
  testimonios: z.looseObject({
    items: z.array(z.looseObject({ name: text(120), quote: text(1000), role: text(120).optional() })).min(1).max(20),
  }),
  faq: z.looseObject({
    items: z.array(z.looseObject({ question: text(300), answer: text(2000) })).min(1).max(30),
  }),
  logos: z.looseObject({ fileIds: z.array(text(200)).min(1).max(20) }),
  beneficios: z.looseObject({
    title: text(200).optional(),
    items: z.array(z.looseObject({ title: text(200), description: text(600).optional() })).min(1).max(12),
  }),
  calendario: z.looseObject({ title: text(200).optional(), url: z.url().optional() }),
  agenda: z.looseObject({
    items: z
      .array(z.looseObject({ title: text(200), time: text(40).optional(), speaker: text(120).optional() }))
      .min(1)
      .max(30),
  }),
  requisitos: z.looseObject({ items: z.array(text(300)).min(1).max(30) }),
};

/** Valida el `content` de un bloque según su tipo y devuelve los problemas (vacío si es válido). */
export function validateBlockContent(type: BlockType, content: unknown): z.core.$ZodIssue[] {
  const result = CONTENT_SCHEMAS[type].safeParse(content);
  return result.success ? [] : result.error.issues;
}

/** Los tipos de bloque que crean un CTA al guardarse en la página. */
export const CTA_BLOCK_TYPES: readonly BlockType[] = ['boton', 'formulario'];

/** Tipos de acción que puede tener el CTA de cada tipo de bloque. */
export const CTA_ACTIONS_BY_BLOCK: Partial<Record<BlockType, readonly ('url' | 'form_submit' | 'scroll_to' | 'checkout')[]>> = {
  boton: ['url', 'scroll_to', 'checkout'],
  formulario: ['form_submit'],
};

const storedBlockSchema = z.looseObject({
  key: z.string(),
  type: z.enum(BLOCK_TYPES),
  order: z.number(),
  content: z.record(z.string(), z.unknown()),
  style: z.record(z.string(), z.unknown()).default({}),
});
export type StoredBlock = z.infer<typeof storedBlockSchema>;

/**
 * Lee los bloques guardados en `Funnel.content` de forma defensiva: si el JSON no tiene
 * la forma esperada (datos viejos o escritos por otra vía) devuelve una lista vacía en vez de
 * fallar; el siguiente guardado del editor lo reemplaza por contenido válido.
 */
export function readBlocks(content: unknown): StoredBlock[] {
  const parsed = z.object({ blocks: z.array(storedBlockSchema) }).safeParse(content);
  return parsed.success ? parsed.data.blocks : [];
}
