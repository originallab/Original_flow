import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/models/prisma.js';
import { connectTestDb, crearFunnel, datosOrden, testDatabaseUrl } from './helpers/db.js';

// Se salta (con aviso) si no hay base de pruebas; con TEST_DATABASE_URL corre contra una base real.
describe.skipIf(!testDatabaseUrl)('esquema de base de datos', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = connectTestDb();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('AuditLog (solo lectura)', () => {
    it('permite insertar y consultar', async () => {
      const fila = await prisma.auditLog.create({
        data: { action: 'prueba.insertar', resourceType: 'prueba', resourceId: 'x', metadata: { ok: true } },
      });
      const leida = await prisma.auditLog.findUnique({ where: { id: fila.id } });
      expect(leida?.action).toBe('prueba.insertar');
    });

    it('rechaza modificar una fila', async () => {
      const fila = await prisma.auditLog.create({ data: { action: 'prueba.modificar', resourceType: 'prueba' } });
      await expect(prisma.auditLog.update({ where: { id: fila.id }, data: { action: 'alterada' } })).rejects.toThrow();
      // Lo que importa es que la fila siga intacta, sin depender del texto del error.
      expect((await prisma.auditLog.findUnique({ where: { id: fila.id } }))?.action).toBe('prueba.modificar');
    });

    it('rechaza borrar una fila', async () => {
      const fila = await prisma.auditLog.create({ data: { action: 'prueba.borrar', resourceType: 'prueba' } });
      await expect(prisma.auditLog.delete({ where: { id: fila.id } })).rejects.toThrow();
      expect(await prisma.auditLog.findUnique({ where: { id: fila.id } })).not.toBeNull();
    });
  });

  describe('Order (idempotencia)', () => {
    it('rechaza dos órdenes con la misma clave de idempotencia en el mismo funnel', async () => {
      const { funnel } = await crearFunnel(prisma);
      await prisma.order.create({ data: datosOrden(funnel.id, { idempotencyKey: 'clave-1' }) });
      await expect(
        prisma.order.create({ data: datosOrden(funnel.id, { idempotencyKey: 'clave-1' }) }),
      ).rejects.toThrow();
    });

    it('permite la misma clave en funnels distintos', async () => {
      const a = await crearFunnel(prisma);
      const b = await crearFunnel(prisma);
      await prisma.order.create({ data: datosOrden(a.funnel.id, { idempotencyKey: 'compartida' }) });
      await expect(
        prisma.order.create({ data: datosOrden(b.funnel.id, { idempotencyKey: 'compartida' }) }),
      ).resolves.toBeDefined();
    });

    it('permite varias órdenes sin clave en el mismo funnel', async () => {
      const { funnel } = await crearFunnel(prisma);
      await prisma.order.create({ data: datosOrden(funnel.id) });
      await expect(prisma.order.create({ data: datosOrden(funnel.id) })).resolves.toBeDefined();
    });
  });

  describe('Funnel', () => {
    it('rechaza un slug repetido', async () => {
      const { funnel, workspace } = await crearFunnel(prisma);
      await expect(
        prisma.funnel.create({
          data: { workspaceId: workspace.id, name: 'Otro', objective: 'leads', slug: funnel.slug },
        }),
      ).rejects.toThrow();
    });

    it('no se puede borrar si tiene órdenes (se conserva el registro del cobro)', async () => {
      const { funnel } = await crearFunnel(prisma);
      await prisma.order.create({ data: datosOrden(funnel.id) });
      await expect(prisma.funnel.delete({ where: { id: funnel.id } })).rejects.toThrow();
    });

    it('al borrarse sin órdenes elimina en cascada sus CTA, leads y eventos', async () => {
      const { funnel, etapa } = await crearFunnel(prisma);
      await prisma.cTA.create({
        data: { funnelId: funnel.id, blockKey: 'cta-1', label: 'Comprar', actionType: 'checkout' },
      });
      const lead = await prisma.lead.create({ data: { funnelId: funnel.id, leadStageId: etapa.id, email: 'a@b.com' } });
      await prisma.event.create({ data: { funnelId: funnel.id, leadId: lead.id, type: 'page_view' } });

      await prisma.funnel.delete({ where: { id: funnel.id } });

      expect(await prisma.cTA.count({ where: { funnelId: funnel.id } })).toBe(0);
      expect(await prisma.lead.count({ where: { funnelId: funnel.id } })).toBe(0);
      expect(await prisma.event.count({ where: { funnelId: funnel.id } })).toBe(0);
    });

    it('el contenido por defecto es una lista de bloques vacía', async () => {
      const { funnel } = await crearFunnel(prisma);
      expect(funnel.content).toEqual({ blocks: [] });
    });
  });

  describe('LeadStage', () => {
    it('no permite dos etapas con el mismo orden en el workspace', async () => {
      const { workspace } = await crearFunnel(prisma);
      await expect(
        prisma.leadStage.create({ data: { workspaceId: workspace.id, name: 'Duplicada', order: 1 } }),
      ).rejects.toThrow();
    });
  });
});
