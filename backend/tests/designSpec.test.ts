import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './helpers/db.js';
import { agregarMiembro, crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

const PALETA = { primary: '#0E7A63', secondary: '#0A4A3C', accent: '#F2B544', background: '#EAF4F0', text: '#0F1F1A' };
const DISENO = { template: 'claridad', palette: PALETA, fonts: { heading: 'Poppins', body: 'Inter' } };

describe.skipIf(!testDatabaseUrl)('PUT /funnels/:id/design-spec', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const put = (token: string, id: string, body: object) => request(app).put(`/api/v1/funnels/${id}/design-spec`).set(encabezados(token)).send(body);

  async function conFunnel() {
    const n = await crearNegocio(app, config);
    const res = await request(app).post('/api/v1/funnels').set(encabezados(n.token)).send({ workspaceId: n.workspace.id, name: 'Curso', objective: 'leads' });
    return { ...n, funnel: res.body as { id: string; slug: string } };
  }

  it('guarda la plantilla, la paleta y las tipografías, y el funnel las devuelve', async () => {
    const { token, funnel } = await conFunnel();
    const res = await put(token, funnel.id, DISENO);
    expect(res.status).toBe(200);
    expect(res.body.designSpec).toEqual(DISENO);
    const abierto = await request(app).get(`/api/v1/funnels/${funnel.id}`).set(encabezados(token));
    expect(abierto.body.designSpec).toEqual(DISENO);
  });

  it('acepta solo la plantilla: la paleta y las tipografías son opcionales', async () => {
    const { token, funnel } = await conFunnel();
    const res = await put(token, funnel.id, { template: 'minimal' });
    expect(res.status).toBe(200);
    expect(res.body.designSpec).toEqual({ template: 'minimal' });
  });

  it('volver a guardar reemplaza el diseño anterior', async () => {
    const { token, funnel } = await conFunnel();
    await put(token, funnel.id, DISENO);
    const res = await put(token, funnel.id, { template: 'agenda' });
    expect(res.body.designSpec).toEqual({ template: 'agenda' });
  });

  it('las 6 plantillas son válidas y una inventada se rechaza con 422', async () => {
    const { token, funnel } = await conFunnel();
    for (const template of ['claridad', 'impacto', 'minimal', 'encuentro', 'recurso', 'agenda']) {
      expect((await put(token, funnel.id, { template })).status).toBe(200);
    }
    expect((await put(token, funnel.id, { template: 'inventada' })).status).toBe(422);
    expect((await put(token, funnel.id, {})).status).toBe(422);
  });

  it('rechaza colores inválidos y tipografías con caracteres peligrosos para CSS', async () => {
    const { token, funnel } = await conFunnel();
    const malos = [
      { template: 'claridad', palette: { ...PALETA, primary: 'verde' } },
      { template: 'claridad', palette: { ...PALETA, accent: 'url(javascript:alert(1))' } },
      { template: 'claridad', palette: { primary: '#0E7A63' } },
      { template: 'claridad', fonts: { heading: 'Poppins; background:red', body: 'Inter' } },
      { template: 'claridad', fonts: { heading: '</style><script>', body: 'Inter' } },
      { template: 'claridad', fonts: { heading: 'Poppins' } },
    ];
    for (const body of malos) expect((await put(token, funnel.id, body)).status).toBe(422);
    expect((await prisma.funnel.findUniqueOrThrow({ where: { id: funnel.id } })).designSpec).toBeNull();
  });

  it('descarta campos desconocidos y queda auditado sin datos sensibles', async () => {
    const { token, funnel } = await conFunnel();
    const res = await put(token, funnel.id, { ...DISENO, scripts: '<script>', workspaceId: 'x' });
    expect(res.body.designSpec).toEqual(DISENO);
    const auditoria = await prisma.auditLog.findFirstOrThrow({ where: { action: 'funnel.design_update', resourceId: funnel.id } });
    expect(auditoria.metadata).toEqual({ template: 'claridad' });
  });

  it('el diseño guardado llega a la página pública cuando el funnel se publica', async () => {
    const { token, funnel } = await conFunnel();
    await put(token, funnel.id, DISENO);
    await request(app).put(`/api/v1/funnels/${funnel.id}/content`).set(encabezados(token)).send({
      blocks: [{ key: 'form', type: 'formulario', order: 1, content: { fields: [{ name: 'email', label: 'Correo', type: 'email' }], submitLabel: 'Enviar' }, style: {} }],
    });
    await request(app).put(`/api/v1/funnels/${funnel.id}/type-config`).set(encabezados(token)).send({ thankYou: { message: 'Gracias' } });
    expect((await request(app).post(`/api/v1/funnels/${funnel.id}/publish`).set(encabezados(token))).status).toBe(200);
    const pagina = await request(app).get(`/api/v1/public/pages/${funnel.slug}`);
    expect(pagina.body.designSpec).toEqual(DISENO);
  });

  it('el vendedor y el analista reciben 403; un funnel de otro cliente, 404; sin sesión, 401', async () => {
    const { workspace, funnel } = await conFunnel();
    for (const role of ['vendedor', 'analista'] as const) {
      const otro = await agregarMiembro(app, prisma, config, workspace.id, role);
      expect((await put(otro.token, funnel.id, DISENO)).status).toBe(403);
    }
    expect((await put((await crearNegocio(app, config)).token, funnel.id, DISENO)).status).toBe(404);
    expect((await request(app).put(`/api/v1/funnels/${funnel.id}/design-spec`).send(DISENO)).status).toBe(401);
    expect((await prisma.funnel.findUniqueOrThrow({ where: { id: funnel.id } })).designSpec).toBeNull();
  });

  it('un id que no es UUID responde 422', async () => {
    const { token } = await conFunnel();
    expect((await put(token, 'abc', DISENO)).status).toBe(422);
  });
});
