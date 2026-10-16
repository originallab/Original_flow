import { z } from 'zod';

const sessionToken = z.uuid();

/** Correo normalizado: sin espacios y en minúsculas, para no duplicar usuarios. */
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * Cuerpo que envía Original Auth al callback. Los nombres van en snake_case porque
 * es el contrato de Original Auth, no el de nuestra API.
 */
export const callbackBodySchema = z.object({
  token_app: z.string().min(1).max(500),
  secret_key: z.string().min(1).max(500),
  email,
  session: sessionToken,
  name: z.string().trim().min(1).max(200).optional(),
});
export type CallbackBody = z.infer<typeof callbackBodySchema>;

export const validateBodySchema = z.object({ session: sessionToken });

export const sessionParamsSchema = z.object({ token: sessionToken });

/** Encabezado `Authorization: Bearer <session>`; devuelve el token o null si no es válido. */
export function parseBearer(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  const parsed = sessionToken.safeParse(header.slice('Bearer '.length).trim());
  return parsed.success ? parsed.data : null;
}
