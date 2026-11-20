import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './helpers/db.js';
import { createFakeMediaGateway, MEDIA_API_KEY, MEDIA_SECRET_KEY } from './helpers/fakeMediaGateway.js';
import { agregarMiembro, crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

/** Bytes que de verdad empiezan como cada formato. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(64, 3)]);

describe.skipIf(!testDatabaseUrl)('imágenes del negocio (Media-as-a-Service simulado)', () => {
  const gateway = createFakeMediaGateway();
  const { app, prisma, config } = buildTestApp({ MEDIAAS_BASE_URL: 'https://maas.ejemplo.com', MEDIAAS_API_KEY: MEDIA_API_KEY, MEDIAAS_SECRET_KEY: MEDIA_SECRET_KEY }, { mediaFetchFn: gateway.fetchFn });
  const sinCredenciales = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
    await sinCredenciales.prisma.$disconnect();
  });
  beforeEach(() => gateway.reset());

  const subir = (token: string, workspaceId: string, cuerpo: Buffer, tipo = 'image/png', nombre?: string) => {
    const req = request(app).post(`/api/v1/assets?workspaceId=${workspaceId}`).set(encabezados(token)).set('Content-Type', tipo);
    return (nombre ? req.set('X-File-Name', encodeURIComponent(nombre)) : req).send(cuerpo);
  };
  const lista = (token: string, workspaceId: string) => request(app).get(`/api/v1/assets?workspaceId=${workspaceId}`).set(encabezados(token));
  const borrar = (token: string, id: string) => request(app).delete(`/api/v1/assets/${id}`).set(encabezados(token));
  const miembro = (workspaceId: string, role: Parameters<typeof agregarMiembro>[4]) => agregarMiembro(app, prisma, config, workspaceId, role);

  it('sube una imagen: va al almacén como pública, queda registrada y devuelve su dirección pública', async () => {
    const n = await crearNegocio(app, config);
    const res = await subir(n.token, n.workspace.id, PNG, 'image/png', 'Mi producto.png');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Mi producto.png', mimeType: 'image/png', size: PNG.length, url: expect.stringMatching(/^https:\/\/maas\.ejemplo\.com\/public\//) });
    expect(gateway.calls[0]?.form?.get('is_public')).toBe('true');
    const fila = await prisma.asset.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(fila).toMatchObject({ workspaceId: n.workspace.id, size: PNG.length });
    expect(fila.mediaFileId).toBeGreaterThan(100);
  });

  it('acepta también JPG y WebP', async () => {
    const n = await crearNegocio(app, config);
    expect((await subir(n.token, n.workspace.id, JPEG, 'image/jpeg', 'foto.jpg')).status).toBe(201);
    expect((await subir(n.token, n.workspace.id, WEBP, 'image/webp', 'foto.webp')).status).toBe(201);
  });

  it('rechaza lo que no es una imagen permitida: SVG, texto, un archivo vacío, o un contenido que no coincide con su tipo', async () => {
    const n = await crearNegocio(app, config);
    const svg = await subir(n.token, n.workspace.id, Buffer.from('<svg onload="alert(1)"></svg>'), 'image/svg+xml');
    expect(svg.status).toBe(422);
    expect(svg.body.error.code).toBe('ASSET_TYPE_NOT_ALLOWED');
    expect((await subir(n.token, n.workspace.id, Buffer.from('hola'), 'text/plain')).status).toBe(422);
    expect((await subir(n.token, n.workspace.id, Buffer.alloc(0), 'image/png')).status).toBe(422);
    const falsa = await subir(n.token, n.workspace.id, Buffer.from('esto es texto, no un PNG'), 'image/png');
    expect(falsa.status).toBe(422);
    expect(falsa.body.error.code).toBe('ASSET_INVALID');
    expect((await subir(n.token, n.workspace.id, JPEG, 'image/png')).body.error.code).toBe('ASSET_INVALID');
    expect(gateway.calls).toHaveLength(0);
  });

  it('una imagen de más de 5 MB responde 413 y no llega al almacén', async () => {
    const n = await crearNegocio(app, config);
    const grande = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024, 1)]);
    expect((await subir(n.token, n.workspace.id, grande)).status).toBe(413);
    expect(gateway.calls).toHaveLength(0);
  });

  it('el nombre se limpia: sin rutas ni caracteres raros, y con la extensión del tipo real', async () => {
    const n = await crearNegocio(app, config);
    expect((await subir(n.token, n.workspace.id, PNG, 'image/png', '../../etc/pass wd<script>.exe')).body.name).toBe('pass wdscript.png');
    expect((await subir(n.token, n.workspace.id, PNG, 'image/png')).body.name).toBe('imagen.png');
  });

  it('lista solo las imágenes de su negocio', async () => {
    const a = await crearNegocio(app, config);
    const b = await crearNegocio(app, config);
    const mia = await subir(a.token, a.workspace.id, PNG, 'image/png', 'a.png');
    await subir(b.token, b.workspace.id, PNG, 'image/png', 'b.png');
    const res = await lista(a.token, a.workspace.id);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([mia.body.id]);
    expect((await lista(a.token, b.workspace.id)).status).toBe(404);
  });

  it('administración, marketing y diseño suben; ventas y análisis reciben 403; otro cliente 404; sin sesión 401', async () => {
    const n = await crearNegocio(app, config);
    for (const role of ['marketing_manager', 'disenador'] as const) expect((await subir((await miembro(n.workspace.id, role)).token, n.workspace.id, PNG)).status).toBe(201);
    for (const role of ['vendedor', 'analista'] as const) expect((await subir((await miembro(n.workspace.id, role)).token, n.workspace.id, PNG)).status).toBe(403);
    const ajeno = await crearNegocio(app, config);
    expect((await subir(ajeno.token, n.workspace.id, PNG)).status).toBe(404);
    expect((await request(app).post(`/api/v1/assets?workspaceId=${n.workspace.id}`).set('Content-Type', 'image/png').send(PNG)).status).toBe(401);
    expect((await request(app).post('/api/v1/assets').set(encabezados(n.token)).set('Content-Type', 'image/png').send(PNG)).status).toBe(422);
  });

  it('eliminar borra el archivo del almacén y el registro; una imagen de otro negocio responde 404', async () => {
    const n = await crearNegocio(app, config);
    const ajeno = await crearNegocio(app, config);
    const subida = await subir(n.token, n.workspace.id, PNG);
    expect((await borrar(ajeno.token, subida.body.id)).status).toBe(404);
    expect((await borrar(n.token, subida.body.id)).status).toBe(204);
    expect(gateway.calls.at(-1)).toMatchObject({ method: 'DELETE' });
    expect(await prisma.asset.count({ where: { id: subida.body.id } })).toBe(0);
    expect((await borrar(n.token, randomUUID())).status).toBe(404);
  });

  it('si el almacén ya no tiene el archivo (404) se borra igual el registro; si no responde, el registro se conserva', async () => {
    const n = await crearNegocio(app, config);
    const a = await subir(n.token, n.workspace.id, PNG);
    gateway.say(404);
    expect((await borrar(n.token, a.body.id)).status).toBe(204);
    const b = await subir(n.token, n.workspace.id, PNG);
    gateway.say(502);
    expect((await borrar(n.token, b.body.id)).status).toBe(503);
    expect(await prisma.asset.count({ where: { id: b.body.id } })).toBe(1);
  });

  it('si el almacén falla al subir, no queda ningún registro', async () => {
    const n = await crearNegocio(app, config);
    gateway.say(502);
    expect((await subir(n.token, n.workspace.id, PNG)).status).toBe(503);
    expect(await prisma.asset.count({ where: { workspaceId: n.workspace.id } })).toBe(0);
  });

  it('queda auditado sin el nombre del archivo', async () => {
    const n = await crearNegocio(app, config);
    await subir(n.token, n.workspace.id, PNG, 'image/png', 'secreto-de-la-persona.png');
    const filas = JSON.stringify(await prisma.auditLog.findMany({ where: { workspaceId: n.workspace.id, action: 'asset.upload' } }));
    expect(filas).toContain('asset.upload');
    expect(filas).not.toContain('secreto-de-la-persona');
  });

  it('sin credenciales de Media-as-a-Service responde 503 MEDIA_NOT_CONFIGURED', async () => {
    const n = await crearNegocio(sinCredenciales.app, sinCredenciales.config);
    const res = await request(sinCredenciales.app).post(`/api/v1/assets?workspaceId=${n.workspace.id}`).set(encabezados(n.token)).set('Content-Type', 'image/png').send(PNG);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('MEDIA_NOT_CONFIGURED');
  });
});
