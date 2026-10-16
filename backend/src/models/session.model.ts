import type { PrismaClient, Session } from '../generated/prisma/client.js';

/** Acceso a datos de `Session`. Solo consultas; las reglas viven en los servicios. */
export function createSessionModel(prisma: PrismaClient) {
  return {
    create(token: string): Promise<Session> {
      return prisma.session.create({ data: { token } });
    },

    findByToken(token: string): Promise<Session | null> {
      return prisma.session.findUnique({ where: { token } });
    },

    markValidated(token: string, userId: string): Promise<Session> {
      return prisma.session.update({ where: { token }, data: { validated: true, userId } });
    },

    /** Borra la sesión si existe; devuelve la fila borrada o null. */
    async delete(token: string): Promise<Session | null> {
      const existing = await prisma.session.findUnique({ where: { token } });
      if (!existing) return null;
      await prisma.session.deleteMany({ where: { token } });
      return existing;
    },
  };
}

export type SessionModel = ReturnType<typeof createSessionModel>;
