import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Crea el cliente de Prisma. Prisma 7 se conecta a PostgreSQL mediante un
 * adaptador; la URL llega desde `config` (nunca se lee aquí del entorno).
 * La aplicación crea un único cliente al arrancar y lo comparte.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

export type { PrismaClient };
