import { Prisma } from '../generated/prisma/client.js';

/** ¿El error es una violación de clave única (P2002)? Sirve para traducirla a un 409 claro. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
