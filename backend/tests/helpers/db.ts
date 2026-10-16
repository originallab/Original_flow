import { randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient } from '../../src/models/prisma.js';

/**
 * Las pruebas de base de datos usan una base REAL (playbook 04): se activan al
 * definir TEST_DATABASE_URL, una base con las migraciones ya aplicadas.
 * Nunca apuntes esta variable a una base con datos que te importen.
 */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export function connectTestDb(): PrismaClient {
  if (!testDatabaseUrl) throw new Error('Falta TEST_DATABASE_URL');
  return createPrismaClient(testDatabaseUrl);
}

/** Crea un cliente, workspace, etapa de lead y funnel con valores únicos para no chocar con otras pruebas. */
export async function crearFunnel(prisma: PrismaClient) {
  const sufijo = randomUUID().slice(0, 8);
  const client = await prisma.client.create({ data: { name: `Cliente ${sufijo}` } });
  const workspace = await prisma.workspace.create({ data: { clientId: client.id, name: `Marca ${sufijo}` } });
  const etapa = await prisma.leadStage.create({ data: { workspaceId: workspace.id, name: 'Nuevo', order: 1 } });
  const funnel = await prisma.funnel.create({
    data: { workspaceId: workspace.id, name: `Funnel ${sufijo}`, objective: 'venta', slug: `funnel-${sufijo}`, price: 4200 },
  });
  return { client, workspace, etapa, funnel };
}

export function datosOrden(funnelId: string, extra: { idempotencyKey?: string } = {}) {
  const sufijo = randomUUID().slice(0, 8);
  return {
    funnelId,
    orderNumber: `OF-${sufijo}`,
    amount: 4200,
    currency: 'MXN',
    customerEmail: 'comprador@correo.com',
    ...extra,
  };
}
