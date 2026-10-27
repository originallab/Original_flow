import { Prisma } from '../generated/prisma/client.js';

/** ¿El error es una violación de clave foránea (P2003)? Por ejemplo, borrar una etapa que todavía tiene leads. */
export function isForeignKeyViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003';
}

/** ¿El error es una violación de clave única (P2002)? Sirve para traducirla a un 409 claro. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
