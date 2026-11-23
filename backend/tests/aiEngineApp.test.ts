import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './helpers/db.js';
import { createFakeAiGateway, GW_API_KEY, GW_SECRET_KEY } from './helpers/fakeAiGateway.js';
import { crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

/** Una página como la que devolvería el modelo para un funnel de venta. */
const PAGINA_DEL_MODELO = {
  designSpec: { template: 'impacto', palette: { primary: '#0E7A63', secondary: '#1B4D3E', accent: '#F4A261', background: '#FFFFFF', text: '#1A1A1A' } },
  seo: { title: 'Curso de datos desde cero', description: 'Aprende a analizar datos con ejercicios reales.' },
  blocks: [
    { key: 'hero', type: 'encabezado', order: 1, content: { title: 'Aprende datos desde cero', subtitle: 'Un curso práctico' }, style: {} },
    { key: 'beneficios', type: 'beneficios', order: 2, content: { title: 'Qué obtienes', items: [{ title: 'Clases prácticas' }, { title: 'Ejercicios guiados', description: 'Con retroalimentación' }] }, style: {} },
    { key: 'comprar', type: 'boton', order: 3, content: { label: 'Quiero inscribirme' }, style: {} },
  ],
};

describe.skipIf(!testDatabaseUrl)('generación con IA de punta a punta (cliente real de IA Engine con gateway simulado)', () => {
  const gateway = createFakeAiGateway();
  const { app, prisma, config } = buildTestApp({ IAENGINE_API_KEY: GW_API_KEY, IAENGINE_SECRET_KEY: GW_SECRET_KEY }, { aiFetchFn: gateway.fetchFn });
  /** Con solo la api_key (falta el secret) la IA no se activa. */
  const incompleta = buildTestApp({ IAENGINE_API_KEY: GW_API_KEY });
  afterAll(async () => {
    await prisma.$disconnect();
    await incompleta.prisma.$disconnect();
  });
  beforeEach(() => gateway.reset());

  async function funnel(a = app, c = config) {
    const n = await crearNegocio(a, c);
    const creado = await request(a).post('/api/v1/funnels').set(encabezados(n.token)).send({ workspaceId: n.workspace.id, name: 'Curso de datos', objective: 'venta', price: 1200, currency: 'MXN' });
    const bloques = [{ key: 'hero', type: 'encabezado', order: 1, content: { title: 'Título original' }, style: {} }];
    await request(a).put(`/api/v1/funnels/${creado.body.id}/content`).set(encabezados(n.token)).send({ blocks: bloques });
    return { ...n, id: creado.body.id as string };
  }
  const generar = (f: { token: string; id: string }, a = app) => request(a).post(`/api/v1/funnels/${f.id}/generate`).set(encabezados(f.token)).send({});
  const contenido = async (id: string) => (await prisma.funnel.findUniqueOrThrow({ where: { id } })).content;

  it('el modelo devuelve una página: se valida, se guarda en borrador con su diseño, SEO y botones, y el gateway recibió una petición firmada con el precio real', async () => {
    const f = await funnel();
    gateway.say(PAGINA_DEL_MODELO);
    const res = await generar(f);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('draft');
    expect(res.body.content.blocks.map((b: { key: string }) => b.key)).toEqual(['hero', 'beneficios', 'comprar']);

    const fila = await prisma.funnel.findUniqueOrThrow({ where: { id: f.id } });
    expect(fila.designSpec).toMatchObject({ template: expect.any(String), fonts: { heading: expect.any(String), body: expect.any(String) } });
    expect(fila.seo).toEqual(PAGINA_DEL_MODELO.seo);
    const ctas = await prisma.cTA.findMany({ where: { funnelId: f.id } });
    expect(ctas.map((c) => [c.blockKey, c.actionType])).toEqual([['comprar', 'checkout']]);

    expect(gateway.calls).toHaveLength(1);
    expect(gateway.calls[0]?.body.metadata).toMatchObject({ action: 'generate_page', workspace_id: f.workspace.id });
    expect(gateway.calls[0]?.body.messages?.[1]?.content).toContain('"precio":1200');
  });

  it('regenerar un bloque devuelve la propuesta del modelo sin guardarla', async () => {
    const f = await funnel();
    const antes = await contenido(f.id);
    gateway.say({ content: { title: 'Un titular mejor', subtitle: 'Más claro' } });
    const res = await request(app).post(`/api/v1/funnels/${f.id}/content/blocks/hero/regenerate`).set(encabezados(f.token)).send({ instruction: 'más claro' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ key: 'hero', type: 'encabezado', content: { title: 'Un titular mejor', subtitle: 'Más claro' } });
    expect(await contenido(f.id)).toEqual(antes);
  });

  it('si el modelo inventa un bloque inválido, responde 503 AI_BAD_RESPONSE y no cambia nada (tras el reintento)', async () => {
    const f = await funnel();
    const antes = await contenido(f.id);
    const mala = { blocks: [{ key: 'hero', type: 'encabezado', order: 1, content: {}, style: {} }] };
    gateway.say(mala);
    const res = await generar(f);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_BAD_RESPONSE');
    expect(await contenido(f.id)).toEqual(antes);
  });

  it('si el gateway rechaza por cuota (429) responde 429 AI_QUOTA_EXCEEDED y no cambia nada; si falla (502), 503 AI_UNAVAILABLE', async () => {
    const f = await funnel();
    const antes = await contenido(f.id);
    gateway.fail(429);
    const cuota = await generar(f);
    expect(cuota.status).toBe(429);
    expect(cuota.body.error.code).toBe('AI_QUOTA_EXCEEDED');
    gateway.fail(502);
    expect((await generar(f)).body.error.code).toBe('AI_UNAVAILABLE');
    expect(await contenido(f.id)).toEqual(antes);
  });

  it('sin las dos credenciales (falta el secret_key) la IA no se activa: 503 AI_NOT_CONFIGURED', async () => {
    const f = await funnel(incompleta.app, incompleta.config);
    const res = await request(incompleta.app).post(`/api/v1/funnels/${f.id}/generate`).set(encabezados(f.token)).send({});
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });

  it('el gateway nunca recibe las llaves en el cuerpo ni los textos van a la auditoría', async () => {
    const f = await funnel();
    gateway.say(PAGINA_DEL_MODELO);
    await generar(f);
    expect(gateway.calls[0]?.rawBody).not.toContain(GW_SECRET_KEY);
    const auditoria = JSON.stringify(await prisma.auditLog.findMany({ where: { workspaceId: f.workspace.id } }));
    expect(auditoria).not.toContain('Aprende datos desde cero');
  });
});
