import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'debe ser un color hexadecimal como #0E7A63');

/** Paleta de la marca: siempre estos cinco colores (ver docs/ARCHITECTURE.md). */
export const brandPaletteSchema = z.object({
  primary: hexColor,
  secondary: hexColor,
  accent: hexColor,
  background: hexColor,
  text: hexColor,
});
export type BrandPalette = z.infer<typeof brandPaletteSchema>;

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const idParamsSchema = z.object({ id: z.uuid() });
export const memberParamsSchema = z.object({ id: z.uuid(), memberId: z.uuid() });

/** POST /workspaces: alta del negocio (onboarding). */
export const createWorkspaceBodySchema = z.object({
  name: shortText(120),
  country: shortText(80).optional(),
  website: shortText(200).optional(),
  industry: shortText(80).optional(),
});
export type CreateWorkspaceBody = z.infer<typeof createWorkspaceBodySchema>;

/** PATCH /workspaces/:id: todos los campos son opcionales, pero debe venir al menos uno. */
export const updateWorkspaceBodySchema = z
  .object({
    name: shortText(120),
    country: shortText(80).nullable(),
    website: shortText(200).nullable(),
    industry: shortText(80).nullable(),
    logoFileId: shortText(200).nullable(),
    brandPalette: brandPaletteSchema.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'debe enviar al menos un campo');
export type UpdateWorkspaceBody = z.infer<typeof updateWorkspaceBodySchema>;

/** Roles que se pueden asignar por invitación; `super_admin` nunca se asigna desde la API. */
export const invitableRoles = ['client_admin', 'marketing_manager', 'vendedor', 'disenador', 'analista'] as const;

export const inviteMemberBodySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role: z.enum(invitableRoles),
});
export type InviteMemberBody = z.infer<typeof inviteMemberBodySchema>;
