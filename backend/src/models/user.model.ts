import { Prisma, type PrismaClient, type User } from '../generated/prisma/client.js';

/** Acceso a datos de `User`. */
export function createUserModel(prisma: PrismaClient) {
  return {
    findById(id: string): Promise<User | null> {
      return prisma.user.findUnique({ where: { id } });
    },

    findByEmail(email: string): Promise<User | null> {
      return prisma.user.findUnique({ where: { email } });
    },

    /**
     * Busca por correo y lo crea si no existe. Si dos callbacks del mismo correo
     * llegan a la vez, el segundo choca con la clave única y se resuelve leyendo
     * el usuario que ganó (sin duplicar).
     */
    async findOrCreateByEmail(email: string, name?: string): Promise<{ user: User; created: boolean }> {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        // El nombre solo se completa si estaba vacío: no se pisa lo que ya se guardó.
        if (!existing.name && name) {
          const user = await prisma.user.update({ where: { id: existing.id }, data: { name } });
          return { user, created: false };
        }
        return { user: existing, created: false };
      }
      try {
        const user = await prisma.user.create({ data: { email, name: name ?? null } });
        return { user, created: true };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const user = await prisma.user.findUniqueOrThrow({ where: { email } });
          return { user, created: false };
        }
        throw err;
      }
    },
  };
}

export type UserModel = ReturnType<typeof createUserModel>;
