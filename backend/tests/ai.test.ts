import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DIRECTIONS } from '../src/funnel-types/directions.js';
import { paletteReads } from '../src/funnel-types/polish.js';
import { testDatabaseUrl } from './helpers/db.js';
import { createFakeAiEngine, VALID_PAGE } from './helpers/fakeAiEngine.js';
import { agregarMiembro, crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

describe.skipIf(!testDatabaseUrl)('generación con IA (esqueleto con motor simulado)', () => {
  const fake = createFakeAiEngine();
  const { app, prisma, config } = buildTestApp({ RATE_LIMIT_AI_PER_HOUR: '1000' }, { aiEngine: fake.engine });
  /** Una app con un cupo corto, solo para probar el límite de usos. */
  const conCupo = buildTestApp({ RATE_LIMIT_AI_PER_HOUR: '3' }, { aiEngine: fake.engine });
  /** La misma app sin motor integrado: es lo que corre hoy en producción. */
  const sinMotor = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
    await sinMotor.prisma.$disconnect();
    await conCupo.prisma.$disconnect();
  });
  beforeEach(() => fake.reset());

  const generar = (token: string, id: string, body: object = {}) => request(app).post(`/api/v1/funnels/${id}/generate`).set(encabezados(token)).send(body);
  const regenerar = (token: string, id: string, key: string, body: object = {}) =>
    request(app).post(`/api/v1/funnels/${id}/content/blocks/${key}/regenerate`).set(encabezados(token)).send(body);
  const miembro = (workspaceId: string, role: Parameters<typeof agregarMiembro>[4]) => agregarMiembro(app, prisma, config, workspaceId, role);

  async function funnel(extra: { sinContenido?: boolean } = {}) {
    const n = await crearNegocio(app, config);
    const creado = await request(app).post('/api/v1/funnels').set(encabezados(n.token)).send({ workspaceId: n.workspace.id, name: 'Curso de datos', objective: 'leads', targetAudience: 'Analistas' });
    const f = creado.body as { id: string };
    if (!extra.sinContenido) {
      const bloques = [{ key: 'hero', type: 'encabezado', order: 1, content: { title: 'Título original' }, style: {} }];
      await request(app).put(`/api/v1/funnels/${f.id}/content`).set(encabezados(n.token)).send({ blocks: bloques });
    }
    return { ...n, f };
  }
  const guardado = (id: string) => prisma.funnel.findUniqueOrThrow({ where: { id } });

  describe('sin motor integrado (hoy)', () => {
    it('generar y regenerar responden 503 AI_NOT_CONFIGURED y no cambian nada', async () => {
      const n = await crearNegocio(sinMotor.app, sinMotor.config);
      const creado = await request(sinMotor.app).post('/api/v1/funnels').set(encabezados(n.token)).send({ workspaceId: n.workspace.id, name: 'Curso', objective: 'leads' });
      const id = creado.body.id as string;
      await request(sinMotor.app).put(`/api/v1/funnels/${id}/content`).set(encabezados(n.token)).send({ blocks: [{ key: 'hero', type: 'encabezado', order: 1, content: { title: 'Hola' }, style: {} }] });

      const gen = await request(sinMotor.app).post(`/api/v1/funnels/${id}/generate`).set(encabezados(n.token)).send({});
      expect(gen.status).toBe(503);
      expect(gen.body.error.code).toBe('AI_NOT_CONFIGURED');
      const reg = await request(sinMotor.app).post(`/api/v1/funnels/${id}/content/blocks/hero/regenerate`).set(encabezados(n.token)).send({});
      expect(reg.status).toBe(503);
      expect(reg.body.error.code).toBe('AI_NOT_CONFIGURED');
      const f = await sinMotor.prisma.funnel.findUniqueOrThrow({ where: { id } });
      expect(f.content).toEqual({ blocks: [{ key: 'hero', type: 'encabezado', order: 1, content: { title: 'Hola' }, style: {} }] });
    });
  });

  describe('POST /funnels/:id/generate', () => {
    it('guarda el contenido, el diseño y el SEO en borrador, sincroniza los CTA y responde el funnel actualizado', async () => {
      const f = await funnel();
      const res = await generar(f.token, f.f.id);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(f.f.id);
      expect(res.body.status).toBe('draft');
      expect(res.body.content.blocks.map((b: { key: string }) => b.key)).toEqual(['hero', 'detalle', 'cta']);

      const fila = await guardado(f.f.id);
      expect(fila.status).toBe('draft');
      expect(fila.designSpec).toMatchObject({ template: expect.any(String), fonts: { heading: expect.any(String) }, palette: expect.any(Object) });
      expect(fila.seo).toEqual(VALID_PAGE.seo);
      const ctas = await prisma.cTA.findMany({ where: { funnelId: f.f.id } });
      expect(ctas.map((c) => c.blockKey)).toEqual(['cta']);
      expect(ctas[0]).toMatchObject({ label: 'Quiero entrar' });
    });

    it('le pasa al motor el contexto (acción, negocio, petición) y lo que escribió la persona', async () => {
      const f = await funnel();
      await generar(f.token, f.f.id, { instruction: 'tono formal' });
      expect(fake.calls).toHaveLength(1);
      const [llamada] = fake.calls;
      expect(llamada?.ctx).toMatchObject({ action: 'generate_page', workspaceId: f.workspace.id, requestId: expect.stringMatching(/^req_/) });
      expect(llamada?.input).toMatchObject({ objective: 'leads', language: 'es', name: 'Curso de datos', targetAudience: 'Analistas', instruction: 'tono formal' });
      expect((llamada?.input as unknown as { blockTypes: string[] }).blockTypes).toContain('encabezado');
    });

    it('le pasa al motor el brief del asistente (resultado, objeciones, tono...) y rechaza un campo demasiado largo', async () => {
      const f = await funnel();
      const brief = { result: 'Conseguir tu primer empleo de datos', objections: 'No tengo tiempo', tone: 'cercano', callToAction: 'Quiero empezar', extra: 'Hay clases grabadas' };
      expect((await generar(f.token, f.f.id, { brief })).status).toBe(200);
      expect((fake.calls[0]?.input as unknown as { details: unknown }).details).toEqual(brief);
      expect((await generar(f.token, f.f.id, { brief: { result: 'x'.repeat(501) } })).status).toBe(422);
    });

    const disenoGuardado = async (id: string) => (await guardado(id)).designSpec as { template: string; fonts: { heading: string; body: string }; look: Record<string, unknown>; palette: Record<string, string> };

    it('el diseño sale de una dirección del catálogo (plantilla, tipografías y aspecto) y no de lo que proponga la IA', async () => {
      const f = await funnel();
      fake.respondPage({ ...VALID_PAGE, designSpec: { ...VALID_PAGE.designSpec, template: 'agenda', fonts: { heading: 'Comic Sans MS', body: 'Inter' }, look: { radius: 'pill', headingWeight: 900 } } });
      expect((await generar(f.token, f.f.id)).status).toBe(200);
      const d = await disenoGuardado(f.f.id);
      const direccion = DIRECTIONS.find((x) => x.fonts.heading === d.fonts.heading && x.fonts.body === d.fonts.body);
      expect(direccion).toBeDefined();
      expect(d.template).toBe(direccion?.template);
      expect(d.look).toEqual(direccion?.look);
    });

    it('le dice a la IA qué dirección de diseño se le asignó y la guarda igual', async () => {
      const f = await funnel();
      await generar(f.token, f.f.id);
      const asignada = (fake.calls[0]?.input as unknown as { direction: { id: string; fonts: unknown } }).direction;
      expect(asignada.id).toBeTruthy();
      expect((await disenoGuardado(f.f.id)).fonts).toEqual(asignada.fonts);
    });

    it('el estilo de cada bloque se completa y se corrige: fondos con ritmo, sin dos franjas fuertes seguidas', async () => {
      const f = await funnel();
      fake.respondPage({
        ...VALID_PAGE,
        blocks: [
          { key: 'hero', type: 'encabezado', order: 1, content: { title: 'Hola' }, style: { variant: 'grande', background: 'dark', color: 'red' } },
          { key: 'a', type: 'texto', order: 2, content: { body: 'Uno' }, style: { variant: 'inventada', background: 'dark' } },
          { key: 'b', type: 'beneficios', order: 3, content: { items: [{ title: 'x' }] }, style: { background: 'accent' } },
          { key: 'c', type: 'texto', order: 4, content: { body: 'Dos' }, style: {} },
          { key: 'cta', type: 'boton', order: 5, content: { label: 'Entrar' }, style: { background: 'accent' } },
        ],
      });
      expect((await generar(f.token, f.f.id)).status).toBe(200);
      const bloques = ((await guardado(f.f.id)).content as { blocks: { key: string; type: string; style: Record<string, string> }[] }).blocks;
      const fondos = bloques.map((b) => b.style.background);
      const fuertes = (x?: string) => x === 'dark' || x === 'accent';
      fondos.forEach((fondo, i) => expect(fuertes(fondo) && fuertes(fondos[i - 1]), `bloque ${i}`).toBeFalsy());
      expect(bloques[0]?.style).toEqual({ variant: 'grande', background: 'dark' });
      expect(bloques.find((b) => b.key === 'a')?.style.variant).not.toBe('inventada');
      expect(bloques.find((b) => b.key === 'cta')?.style.background).toBeUndefined();
      expect(bloques.every((b) => Object.keys(b.style).every((k) => k === 'variant' || k === 'background'))).toBe(true);
      // dos textos seguidos no se dibujan igual
      const textos = bloques.filter((b) => b.type === 'texto').map((b) => b.style.variant);
      expect(new Set(textos).size).toBe(textos.length);
    });

    it('la paleta: la de la IA si se lee bien, y la de la dirección si no', async () => {
      const f = await funnel();
      await generar(f.token, f.f.id);
      expect((await disenoGuardado(f.f.id)).palette).toEqual(VALID_PAGE.designSpec.palette);

      const g = await funnel();
      fake.respondPage({ ...VALID_PAGE, designSpec: { ...VALID_PAGE.designSpec, palette: { primary: '#FFFFFF', secondary: '#EEEEEE', accent: '#FAFAFA', background: '#FFFFFF', text: '#F5F5F5' } } });
      await generar(g.token, g.f.id);
      const d = await disenoGuardado(g.f.id);
      const direccion = DIRECTIONS.find((x) => x.fonts.heading === d.fonts.heading && x.fonts.body === d.fonts.body);
      expect(d.palette).toEqual(direccion?.palette);
      expect(paletteReads(d.palette as never)).toBe(true);
    });

    it('con paleta de marca, se le pide a la IA y se guarda tal cual (no se retoca) aunque la IA elija otra', async () => {
      const f = await funnel();
      const marca = { primary: '#112233', secondary: '#223344', accent: '#334455', background: '#F0F0F0', text: '#101010' };
      await prisma.workspace.update({ where: { id: f.workspace.id }, data: { brandPalette: marca } });
      await generar(f.token, f.f.id);
      expect((fake.calls[0]?.input as unknown as { brandPalette: unknown }).brandPalette).toEqual(marca);
      expect((await disenoGuardado(f.f.id)).palette).toEqual(marca);
    });

    it('con paleta de marca y una IA que no manda diseño, igual se guarda la paleta de la marca', async () => {
      const f = await funnel();
      const marca = { primary: '#112233', secondary: '#223344', accent: '#334455', background: '#F0F0F0', text: '#101010' };
      await prisma.workspace.update({ where: { id: f.workspace.id }, data: { brandPalette: marca } });
      fake.respondPage({ blocks: VALID_PAGE.blocks });
      await generar(f.token, f.f.id);
      expect((await disenoGuardado(f.f.id)).palette).toEqual(marca);
    });

    it('al volver a generar se conserva la dirección de diseño de la página', async () => {
      const f = await funnel();
      await generar(f.token, f.f.id);
      const antes = (await disenoGuardado(f.f.id)).fonts;
      for (let i = 0; i < 4; i += 1) {
        await generar(f.token, f.f.id);
        expect((await disenoGuardado(f.f.id)).fonts).toEqual(antes);
      }
    });

    it('las páginas de un mismo negocio no repiten tipografías', async () => {
      const f = await funnel();
      const usadas = new Set<string>();
      const crear = async () => {
        const creado = await request(app).post('/api/v1/funnels').set(encabezados(f.token)).send({ workspaceId: f.workspace.id, name: 'Otro funnel', objective: 'leads' });
        await request(app).put(`/api/v1/funnels/${creado.body.id}/content`).set(encabezados(f.token)).send({ blocks: [{ key: 'hero', type: 'encabezado', order: 1, content: { title: 'T' }, style: {} }] });
        await generar(f.token, creado.body.id);
        const d = await disenoGuardado(creado.body.id);
        usadas.add(`${d.fonts.heading}|${d.fonts.body}`);
      };
      for (let i = 0; i < 5; i += 1) await crear();
      expect(usadas.size).toBe(5);
    });

    it('negocios de rubros distintos reciben diseños distintos', async () => {
      const rubros: [string, string][] = [
        ['Terapia de pareja y bienestar emocional', 'citas'],
        ['Software de facturación para pymes', 'leads'],
        ['Tienda de ropa con ofertas', 'venta'],
      ];
      const fuentes = new Set<string>();
      for (const [nombre, objetivo] of rubros) {
        const n = await crearNegocio(app, config);
        const creado = await request(app).post('/api/v1/funnels').set(encabezados(n.token)).send({ workspaceId: n.workspace.id, name: nombre, objective: objetivo });
        await request(app).put(`/api/v1/funnels/${creado.body.id}/content`).set(encabezados(n.token)).send({ blocks: [{ key: 'hero', type: 'encabezado', order: 1, content: { title: 'T' }, style: {} }] });
        await generar(n.token, creado.body.id);
        fuentes.add((await disenoGuardado(creado.body.id)).fonts.heading);
      }
      expect(fuentes.size).toBe(3);
    });

    describe('con imágenes que subió la persona', () => {
      const URL = 'https://maas.ejemplo.com/public/acme/app/image/producto.png';
      const asset = (workspaceId: string, url = URL) =>
        prisma.asset.create({ data: { workspaceId, mediaFileId: 1, s3Key: 'k', publicUrl: url, name: 'producto.png', mimeType: 'image/png', size: 10 } });
      const conImagen = (url: string) => ({ blocks: [...VALID_PAGE.blocks, { key: 'foto', type: 'imagen', order: 4, content: { url, alt: 'El producto' }, style: {} }] });

      it('se le pasan a la IA (solo su dirección y su nombre) y, si las usa, se guardan en la página', async () => {
        const f = await funnel();
        const a = await asset(f.workspace.id);
        fake.respondPage(conImagen(URL));
        const res = await generar(f.token, f.f.id, { images: [a.id] });
        expect(res.status).toBe(200);
        expect((fake.calls[0]?.input as unknown as { images: unknown }).images).toEqual([{ url: URL, name: 'producto.png' }]);
        expect(res.body.content.blocks.some((b: { type: string }) => b.type === 'imagen')).toBe(true);
      });

      it('si el negocio tiene logo, se le pasa a la IA y puede mostrarlo; sin fotos, el logo es la única imagen permitida', async () => {
        const f = await funnel();
        const logo = await asset(f.workspace.id, 'https://maas.ejemplo.com/public/acme/app/image/logo.png');
        await prisma.workspace.update({ where: { id: f.workspace.id }, data: { logoFileId: logo.id } });
        fake.respondPage(conImagen('https://maas.ejemplo.com/public/acme/app/image/logo.png'));
        const res = await generar(f.token, f.f.id);
        expect(res.status).toBe(200);
        expect((fake.calls[0]?.input as unknown as { logoUrl?: string }).logoUrl).toBe('https://maas.ejemplo.com/public/acme/app/image/logo.png');
        fake.respondPage(conImagen(URL));
        expect((await generar(f.token, f.f.id)).body.error.code).toBe('AI_BAD_RESPONSE');
      });

      it('el logo de otro negocio no se usa', async () => {
        const f = await funnel();
        const otro = await funnel();
        const ajeno = await asset(otro.workspace.id, 'https://maas.ejemplo.com/public/otro/logo.png');
        await prisma.workspace.update({ where: { id: f.workspace.id }, data: { logoFileId: ajeno.id } });
        await generar(f.token, f.f.id);
        expect((fake.calls[0]?.input as unknown as { logoUrl?: string }).logoUrl).toBeUndefined();
      });

      it('una dirección que la persona NO subió (inventada) invalida la página: 503 AI_BAD_RESPONSE y no se guarda nada', async () => {
        const f = await funnel();
        const a = await asset(f.workspace.id);
        const antes = (await guardado(f.f.id)).content;
        fake.respondPage(conImagen('https://otro-sitio.com/inventada.png'));
        const res = await generar(f.token, f.f.id, { images: [a.id] });
        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe('AI_BAD_RESPONSE');
        expect((await guardado(f.f.id)).content).toEqual(antes);
      });

      it('sin imágenes, un bloque de imagen que invente la IA también se rechaza', async () => {
        const f = await funnel();
        fake.respondPage(conImagen(URL));
        expect((await generar(f.token, f.f.id)).body.error.code).toBe('AI_BAD_RESPONSE');
      });

      it('una imagen de otro negocio, o que no existe, responde 422 ASSET_NOT_FOUND y no llama a la IA', async () => {
        const f = await funnel();
        const otro = await funnel();
        const ajena = await asset(otro.workspace.id);
        for (const id of [ajena.id, randomUUID()]) {
          const res = await generar(f.token, f.f.id, { images: [id] });
          expect(res.status).toBe(422);
          expect(res.body.error.code).toBe('ASSET_NOT_FOUND');
        }
        expect(fake.calls).toHaveLength(0);
      });

      it('acepta hasta 6 imágenes; más, o ids que no son UUID, responde 422', async () => {
        const f = await funnel();
        expect((await generar(f.token, f.f.id, { images: Array.from({ length: 7 }, () => randomUUID()) })).status).toBe(422);
        expect((await generar(f.token, f.f.id, { images: ['no-es-uuid'] })).status).toBe(422);
      });
    });

    it('si el SEO no viene, conserva el que ya tenía', async () => {
      const f = await funnel();
      await prisma.funnel.update({ where: { id: f.f.id }, data: { seo: { title: 'Mi título' } } });
      fake.respondPage({ blocks: VALID_PAGE.blocks });
      expect((await generar(f.token, f.f.id)).status).toBe(200);
      expect((await guardado(f.f.id)).seo).toEqual({ title: 'Mi título' });
    });

    it('una propuesta inválida (bloque malo, claves repetidas, vacía o sin forma) responde 503 AI_BAD_RESPONSE y NO guarda nada', async () => {
      const f = await funnel();
      const antes = await guardado(f.f.id);
      const malas = [
        { blocks: [{ key: 'hero', type: 'encabezado', order: 1, content: {}, style: {} }] },
        { blocks: [VALID_PAGE.blocks[0], VALID_PAGE.blocks[0]] },
        { blocks: [{ key: 'x', type: 'inventado', order: 1, content: {}, style: {} }] },
        { blocks: [] },
        { designSpec: { template: 'no-existe' }, blocks: VALID_PAGE.blocks },
        'texto libre',
        null,
      ];
      for (const mala of malas) {
        fake.respondPage(mala);
        const res = await generar(f.token, f.f.id);
        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe('AI_BAD_RESPONSE');
      }
      const despues = await guardado(f.f.id);
      expect(despues.content).toEqual(antes.content);
      expect(despues.designSpec).toEqual(antes.designSpec);
      expect(await prisma.auditLog.count({ where: { workspaceId: f.workspace.id, action: 'funnel.ai_generate' } })).toBe(0);
    });

    it('si el motor falla (error de red o servicio caído) responde 503 y el funnel queda como estaba', async () => {
      const f = await funnel();
      const antes = await guardado(f.f.id);
      fake.failWith(new Error('fetch failed'));
      const a = await generar(f.token, f.f.id);
      expect(a.status).toBe(503);
      expect(a.body.error.code).toBe('AI_UNAVAILABLE');
      fake.unavailable();
      expect((await generar(f.token, f.f.id)).body.error.code).toBe('AI_UNAVAILABLE');
      expect((await guardado(f.f.id)).content).toEqual(antes.content);
    });

    it('un funnel publicado responde 409 FUNNEL_PUBLISHED y no llama al motor', async () => {
      const f = await funnel();
      await prisma.funnel.update({ where: { id: f.f.id }, data: { status: 'published' } });
      const res = await generar(f.token, f.f.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('FUNNEL_PUBLISHED');
      expect(fake.calls).toHaveLength(0);
    });

    it('queda auditado sin ningún texto de la página ni de la persona', async () => {
      const f = await funnel();
      await generar(f.token, f.f.id, { instruction: 'texto privado de la persona' });
      const filas = await prisma.auditLog.findMany({ where: { workspaceId: f.workspace.id, action: 'funnel.ai_generate' } });
      expect(filas).toHaveLength(1);
      expect(filas[0]?.metadata).toEqual({ blocks: 3 });
      expect(JSON.stringify(filas)).not.toContain('privado');
      expect(JSON.stringify(filas)).not.toContain('Aprende datos');
    });

    it('administración, marketing y diseño pueden generar; ventas y análisis reciben 403 sin llamar al motor', async () => {
      const f = await funnel();
      for (const role of ['marketing_manager', 'disenador'] as const) {
        expect((await generar((await miembro(f.workspace.id, role)).token, f.f.id)).status).toBe(200);
        fake.reset();
        await prisma.funnel.update({ where: { id: f.f.id }, data: { status: 'draft' } });
      }
      const llamadas = fake.calls.length;
      for (const role of ['vendedor', 'analista'] as const) {
        expect((await generar((await miembro(f.workspace.id, role)).token, f.f.id)).status).toBe(403);
      }
      expect(fake.calls.length).toBe(llamadas);
    });

    it('un funnel de otro cliente responde 404, un id que no existe 404, sin sesión 401, y una indicación demasiado larga 422', async () => {
      const mio = await funnel();
      const ajeno = await funnel();
      expect((await generar(mio.token, ajeno.f.id)).status).toBe(404);
      expect((await generar(mio.token, randomUUID())).status).toBe(404);
      expect((await request(app).post(`/api/v1/funnels/${mio.f.id}/generate`).send({})).status).toBe(401);
      expect((await generar(mio.token, mio.f.id, { instruction: 'x'.repeat(501) })).status).toBe(422);
      expect(fake.calls).toHaveLength(0);
    });

    it('el negocio tiene un cupo de usos por hora (429) que no comparte con otros negocios ni gasta con peticiones rechazadas', async () => {
      const crear = async () => {
        const n = await crearNegocio(conCupo.app, conCupo.config);
        const creado = await request(conCupo.app).post('/api/v1/funnels').set(encabezados(n.token)).send({ workspaceId: n.workspace.id, name: 'Curso', objective: 'leads' });
        return { ...n, id: creado.body.id as string };
      };
      const pedir = (n: { token: string }, id: string) => request(conCupo.app).post(`/api/v1/funnels/${id}/generate`).set(encabezados(n.token)).send({});
      const a = await crear();
      const b = await crear();
      // Peticiones rechazadas antes de llegar al motor no gastan cupo.
      await pedir(a, 'no-es-uuid');
      const vendedor = await agregarMiembro(conCupo.app, conCupo.prisma, conCupo.config, a.workspace.id, 'vendedor');
      await pedir(vendedor, a.id);
      for (let i = 0; i < 3; i += 1) expect((await pedir(a, a.id)).status).toBe(200);
      const excedido = await pedir(a, a.id);
      expect(excedido.status).toBe(429);
      expect(excedido.body.error.code).toBe('AI_RATE_LIMITED');
      expect((await pedir(b, b.id)).status).toBe(200);
    });
  });

  describe('POST /funnels/:id/content/blocks/:key/regenerate', () => {
    it('devuelve una propuesta para el bloque y NO la guarda', async () => {
      const f = await funnel();
      const antes = await guardado(f.f.id);
      const res = await regenerar(f.token, f.f.id, 'hero', { instruction: 'más corto' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ key: 'hero', type: 'encabezado', content: { title: 'Un título nuevo', subtitle: 'Un subtítulo nuevo' } });
      expect((await guardado(f.f.id)).content).toEqual(antes.content);
      expect(fake.calls[0]?.ctx).toMatchObject({ action: 'regenerate_block', workspaceId: f.workspace.id });
      expect(fake.calls[0]?.input).toMatchObject({ block: { key: 'hero', type: 'encabezado', content: { title: 'Título original' } }, instruction: 'más corto' });
    });

    it('un bloque de un tipo que la IA no debe inventar (testimonios, logos...) responde 422 AI_BLOCK_NOT_SUPPORTED y no llama al motor', async () => {
      const f = await funnel();
      const bloques = [
        { key: 'hero', type: 'encabezado', order: 1, content: { title: 'Hola' }, style: {} },
        { key: 'opiniones', type: 'testimonios', order: 2, content: { items: [{ name: 'Ana', quote: 'Muy bueno' }] }, style: {} },
      ];
      await request(app).put(`/api/v1/funnels/${f.f.id}/content`).set(encabezados(f.token)).send({ blocks: bloques });
      const res = await regenerar(f.token, f.f.id, 'opiniones');
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('AI_BLOCK_NOT_SUPPORTED');
      expect(fake.calls).toHaveLength(0);
    });

    it('un bloque que no existe responde 404 y no llama al motor', async () => {
      const f = await funnel();
      const res = await regenerar(f.token, f.f.id, 'no-existe');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BLOCK_NOT_FOUND');
      expect(fake.calls).toHaveLength(0);
    });

    it('una propuesta que no sirve para ese tipo de bloque responde 503 AI_BAD_RESPONSE', async () => {
      const f = await funnel();
      for (const mala of [{ content: {} }, { content: { subtitle: 'sin título' } }, { content: 'texto' }, { content: [1] }, {}, null, 'hola']) {
        fake.respondBlock(mala);
        const res = await regenerar(f.token, f.f.id, 'hero');
        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe('AI_BAD_RESPONSE');
      }
    });

    it('si el motor falla, 503 AI_UNAVAILABLE; ventas y análisis 403; funnel ajeno 404; permite un funnel publicado', async () => {
      const f = await funnel();
      fake.failWith(new Error('boom'));
      expect((await regenerar(f.token, f.f.id, 'hero')).body.error.code).toBe('AI_UNAVAILABLE');
      fake.failWith(null);
      expect((await regenerar((await miembro(f.workspace.id, 'vendedor')).token, f.f.id, 'hero')).status).toBe(403);
      const ajeno = await funnel();
      expect((await regenerar(f.token, ajeno.f.id, 'hero')).status).toBe(404);
      await prisma.funnel.update({ where: { id: f.f.id }, data: { status: 'published' } });
      expect((await regenerar(f.token, f.f.id, 'hero')).status).toBe(200);
    });
  });
});
