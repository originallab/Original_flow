import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './helpers/db.js';
import { crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

describe.skipIf(!testDatabaseUrl)('logo del negocio', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const URL = 'https://maas.ejemplo.com/public/acme/app/image/logo.png';
  const asset = (workspaceId: string) => prisma.asset.create({ data: { workspaceId, mediaFileId: 1, s3Key: 'k', publicUrl: URL, name: 'logo.png', mimeType: 'image/png', size: 10 } });
  const patch = (token: string, id: string, body: object) => request(app).patch(`/api/v1/workspaces/${id}`).set(encabezados(token)).send(body);

  it('sin logo, logoUrl es null', async () => {
    const n = await crearNegocio(app, config);
    expect(n.workspace).toMatchObject({ logoFileId: null });
    const res = await request(app).get(`/api/v1/workspaces/${n.workspace.id}`).set(encabezados(n.token));
    expect(res.body.logoUrl).toBeNull();
  });

  it('elegir una imagen del negocio como logo devuelve su dirección pública en el PATCH, en el GET y en la lista', async () => {
    const n = await crearNegocio(app, config);
    const a = await asset(n.workspace.id);
    const res = await patch(n.token, n.workspace.id, { logoFileId: a.id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ logoFileId: a.id, logoUrl: URL });
    expect((await request(app).get(`/api/v1/workspaces/${n.workspace.id}`).set(encabezados(n.token))).body.logoUrl).toBe(URL);
    const lista = await request(app).get('/api/v1/workspaces').set(encabezados(n.token));
    expect(lista.body.items.find((w: { id: string }) => w.id === n.workspace.id).logoUrl).toBe(URL);
  });

  it('quitar el logo (null) deja logoUrl en null', async () => {
    const n = await crearNegocio(app, config);
    const a = await asset(n.workspace.id);
    await patch(n.token, n.workspace.id, { logoFileId: a.id });
    const res = await patch(n.token, n.workspace.id, { logoFileId: null });
    expect(res.body).toMatchObject({ logoFileId: null, logoUrl: null });
  });

  it('una imagen de otro negocio, una que no existe o un id que no es UUID responden 422 y no cambian el logo', async () => {
    const n = await crearNegocio(app, config);
    const otro = await crearNegocio(app, config);
    const ajena = await asset(otro.workspace.id);
    for (const logoFileId of [ajena.id, '11111111-1111-4111-8111-111111111111', 'no-es-uuid']) {
      const res = await patch(n.token, n.workspace.id, { logoFileId });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].path).toBe('logoFileId');
    }
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: n.workspace.id } })).logoFileId).toBeNull();
  });
});
