import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './helpers/db.js';
import { agregarMiembro, crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

const DIA = 86_400_000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA);
const FORM = { fields: [{ name: 'email', label: 'Correo', type: 'email', required: true }], submitLabel: 'Quiero info' };
const bloque = (key: string, type: string, content: object, order: number) => ({ key, type, order, content, style: {} });
const SIN_ID = '6c5b9f4e-6b0e-4a43-9d3b-0c1f4f3b7a11';

describe.skipIf(!testDatabaseUrl)('leads del tablero', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const get = (token: string, ruta: string) => request(app).get(`/api/v1${ruta}`).set(encabezados(token));
  const post = (token: string, ruta: string, body: object = {}) => request(app).post(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const put = (token: string, ruta: string, body: object) => request(app).put(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const patch = (token: string, ruta: string, body: object) => request(app).patch(`/api/v1${ruta}`).set(encabezados(token)).send(body);
  const miembro = (workspaceId: string, role: Parameters<typeof agregarMiembro>[4]) => agregarMiembro(app, prisma, config, workspaceId, role);

  /** Un negocio con dos funnels («Curso» y «Taller») y las cinco etapas de siempre. */
  async function negocio() {
    const n = await crearNegocio(app, config);
    const curso = (await post(n.token, '/funnels', { workspaceId: n.workspace.id, name: 'Curso', objective: 'leads' })).body as { id: string; slug: string };
    const taller = (await post(n.token, '/funnels', { workspaceId: n.workspace.id, name: 'Taller', objective: 'leads' })).body as { id: string };
    const etapas = await prisma.leadStage.findMany({ where: { workspaceId: n.workspace.id }, orderBy: { order: 'asc' } });
    return { ...n, curso, taller, etapas, nuevo: etapas[0]!, cliente: etapas[4]! };
  }
  type Negocio = Awaited<ReturnType<typeof negocio>>;

  async function sembrar(n: Negocio, datos: { funnelId?: string; leadStageId?: string; dias?: number } & Record<string, unknown> = {}) {
    const { funnelId = n.curso.id, leadStageId = n.nuevo.id, dias = 1, ...resto } = datos;
    return prisma.lead.create({ data: { funnelId, leadStageId, email: 'persona@correo.com', createdAt: hace(dias), ...resto } as never });
  }

  const lista = (n: Negocio, extra = '') => get(n.token, `/leads?workspaceId=${n.workspace.id}${extra}`);
  const nombres = (res: request.Response) => res.body.items.map((item: { name: string }) => item.name);

  describe('GET /leads', () => {
    it('lista los leads del negocio, del más nuevo al más viejo, con el nombre del funnel y los datos tal como están guardados', async () => {
      const n = await negocio();
      await sembrar(n, { name: 'Vieja', dias: 5 });
      await sembrar(n, {
        name: 'Nueva',
        dias: 1,
        funnelId: n.taller.id,
        phone: '+52 618 111 2233',
        value: 1250.5,
        utm: { utm_source: 'instagram' },
        customFields: { motivo: 'curso', _consentAt: '2026-10-01T00:00:00.000Z' },
      });
      await sembrar(n, { name: 'Media', dias: 3 });

      const res = await lista(n);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 3, page: 1, pageSize: 25 });
      expect(nombres(res)).toEqual(['Nueva', 'Media', 'Vieja']);
      expect(res.body.items[0]).toEqual({
        id: expect.any(String),
        funnelId: n.taller.id,
        funnelName: 'Taller',
        leadStageId: n.nuevo.id,
        name: 'Nueva',
        email: 'persona@correo.com',
        phone: '+52 618 111 2233',
        source: 'web_form',
        utm: { utm_source: 'instagram' },
        assignedTo: null,
        value: 1250.5,
        customFields: { motivo: 'curso', _consentAt: '2026-10-01T00:00:00.000Z' },
        createdAt: expect.any(String),
      });
      expect(res.body.items[0]).not.toHaveProperty('funnel');
      expect(res.body.items[1]).toMatchObject({ value: null, utm: null, customFields: null });
    });

    it('pagina, y un lead de otro negocio nunca aparece', async () => {
      const n = await negocio();
      const otro = await negocio();
      for (let i = 1; i <= 5; i += 1) await sembrar(n, { name: `Lead ${i}`, dias: i });
      await sembrar(otro, { name: 'Ajeno' });

      const pagina = await lista(n, '&pageSize=2&page=3');
      expect(pagina.body).toMatchObject({ total: 5, page: 3, pageSize: 2 });
      expect(nombres(pagina)).toEqual(['Lead 5']);
      expect(nombres(await lista(n, '&pageSize=100'))).not.toContain('Ajeno');
    });

    it('filtra por funnel, etapa y origen, y los filtros se combinan', async () => {
      const n = await negocio();
      await sembrar(n, { name: 'A', funnelId: n.curso.id, leadStageId: n.nuevo.id, dias: 1 });
      await sembrar(n, { name: 'B', funnelId: n.taller.id, leadStageId: n.nuevo.id, dias: 2 });
      await sembrar(n, { name: 'C', funnelId: n.curso.id, leadStageId: n.cliente.id, dias: 3, source: 'whatsapp' });

      expect(nombres(await lista(n, `&funnelId=${n.taller.id}`))).toEqual(['B']);
      expect(nombres(await lista(n, `&stageId=${n.cliente.id}`))).toEqual(['C']);
      expect(nombres(await lista(n, '&source=whatsapp'))).toEqual(['C']);
      expect(nombres(await lista(n, `&funnelId=${n.curso.id}&stageId=${n.nuevo.id}`))).toEqual(['A']);
      expect(nombres(await lista(n, `&funnelId=${n.taller.id}&stageId=${n.cliente.id}`))).toEqual([]);
    });

    it('un funnel de otro negocio no devuelve nada (ni confirma que existe)', async () => {
      const n = await negocio();
      const otro = await negocio();
      await sembrar(otro, { name: 'Ajeno' });
      const res = await lista(n, `&funnelId=${otro.curso.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ items: [], total: 0 });
    });

    it('busca en nombre, correo y teléfono sin distinguir mayúsculas; los comodines se toman literales', async () => {
      const n = await negocio();
      await sembrar(n, { name: 'María López', email: 'maria@correo.com', dias: 1 });
      await sembrar(n, { name: 'Juan', email: 'juan@correo.com', phone: '+52 618 555 0000', dias: 2 });
      await sembrar(n, { name: 'Descuento 50%', email: 'x@correo.com', dias: 3 });
      await sembrar(n, { name: 'Sin_guion', email: 'y@correo.com', dias: 4 });
      await sembrar(n, { name: 'ruta\\carpeta', email: 'z@correo.com', dias: 5 });

      expect(nombres(await lista(n, '&q=LÓPEZ'))).toEqual(['María López']);
      expect(nombres(await lista(n, '&q=juan@CORREO'))).toEqual(['Juan']);
      expect(nombres(await lista(n, '&q=618%20555'))).toEqual(['Juan']);
      expect(nombres(await lista(n, '&q=%25'))).toEqual(['Descuento 50%']);
      expect(nombres(await lista(n, '&q=_'))).toEqual(['Sin_guion']);
      expect(nombres(await lista(n, '&q=a%5Cc'))).toEqual(['ruta\\carpeta']);
      expect(nombres(await lista(n, '&q=nadie'))).toEqual([]);
      // Un texto vacío o de espacios no filtra.
      expect(await lista(n, '&q=%20%20')).toMatchObject({ body: { total: 5 } });
    });

    it('un lead que llegó por la página publicada aparece en el tablero, en la primera etapa', async () => {
      const n = await negocio();
      await put(n.token, `/funnels/${n.curso.id}/content`, { blocks: [bloque('hero', 'encabezado', { title: 'Hola' }, 1), bloque('form', 'formulario', FORM, 2)] });
      await put(n.token, `/funnels/${n.curso.id}/type-config`, { thankYou: { message: 'Gracias' } });
      expect((await post(n.token, `/funnels/${n.curso.id}/publish`)).status).toBe(200);
      const enviado = await request(app).post(`/api/v1/public/funnels/${n.curso.slug}/leads`).send({ email: 'Visita@Correo.com', name: 'Visita', consent: true, utm: { utm_source: 'tiktok' } });
      expect(enviado.status).toBe(201);

      const res = await lista(n);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]).toMatchObject({ name: 'Visita', email: 'visita@correo.com', leadStageId: n.nuevo.id, funnelName: 'Curso', utm: { utm_source: 'tiktok' } });
    });

    it('rechaza con 422 lo que no es válido', async () => {
      const n = await negocio();
      expect((await get(n.token, '/leads')).status).toBe(422);
      expect((await get(n.token, '/leads?workspaceId=no-es-un-id')).status).toBe(422);
      for (const extra of ['&funnelId=x', '&stageId=x', '&source=sms', `&q=${'a'.repeat(101)}`, '&pageSize=101', '&page=0']) {
        expect((await lista(n, extra)).status, extra).toBe(422);
      }
    });
  });

  describe('GET /leads/:id', () => {
    it('devuelve el lead con la misma forma que la lista', async () => {
      const n = await negocio();
      const creado = await sembrar(n, { name: 'Ana', value: 99 });
      const res = await get(n.token, `/leads/${creado.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: creado.id, name: 'Ana', funnelName: 'Curso', value: 99 });
      expect((await lista(n)).body.items[0]).toEqual(res.body);
    });

    it('uno inexistente, de otro cliente o con id inválido no se ve', async () => {
      const n = await negocio();
      const ajeno = await crearNegocio(app, config);
      const creado = await sembrar(n);
      expect((await get(ajeno.token, `/leads/${creado.id}`)).status).toBe(404);
      expect((await get(n.token, `/leads/${SIN_ID}`)).body.error.code).toBe('LEAD_NOT_FOUND');
      expect((await get(n.token, '/leads/no-es-un-id')).status).toBe(422);
    });
  });

  describe('POST /leads', () => {
    const datos = (n: Negocio, extra: object = {}) => ({ funnelId: n.curso.id, name: 'Rosa', email: 'rosa@correo.com', ...extra });

    it('da de alta un lead en la primera etapa, con el correo en minúsculas y sin UTM', async () => {
      const n = await negocio();
      const res = await post(n.token, '/leads', datos(n, { email: '  ROSA@Correo.com ', value: 100.555, customFields: { motivo: 'visita' } }));
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        funnelId: n.curso.id,
        funnelName: 'Curso',
        leadStageId: n.nuevo.id,
        name: 'Rosa',
        email: 'rosa@correo.com',
        phone: null,
        source: 'web_form',
        utm: {},
        assignedTo: null,
        value: 100.56,
        customFields: { motivo: 'visita' },
      });
      expect(res.body.utm).toEqual({});
      expect((await get(n.token, `/leads/${res.body.id}`)).body).toEqual(res.body);
      const guardado = await prisma.lead.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(guardado.customFields).toEqual({ motivo: 'visita' });
    });

    it('con etapa, origen y solo teléfono; la etapa debe ser del negocio', async () => {
      const n = await negocio();
      const otro = await negocio();
      const ok = await post(n.token, '/leads', { funnelId: n.taller.id, phone: '+52 618 111 2233', leadStageId: n.etapas[2]!.id, source: 'whatsapp' });
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ leadStageId: n.etapas[2]!.id, source: 'whatsapp', email: null, phone: '+52 618 111 2233', name: null });

      const ajena = await post(n.token, '/leads', datos(n, { leadStageId: otro.nuevo.id }));
      expect(ajena.status).toBe(422);
      expect(ajena.body.error.details[0].path).toBe('leadStageId');
      expect((await post(n.token, '/leads', datos(n, { leadStageId: SIN_ID }))).status).toBe(422);
    });

    it('exige correo o teléfono y valida cada dato', async () => {
      const n = await negocio();
      const caso = async (extra: object, campo: string, base: object = datos(n)) => {
        const res = await post(n.token, '/leads', { ...base, ...extra });
        expect(res.status, JSON.stringify(extra)).toBe(422);
        expect(res.body.error.details.map((d: { path: string }) => d.path), JSON.stringify(extra)).toContain(campo);
      };
      await caso({}, 'email', { funnelId: n.curso.id, name: 'Sin contacto' });
      await caso({ email: 'no-es-correo' }, 'email');
      await caso({ phone: 'abc' }, 'phone');
      await caso({ name: '' }, 'name');
      await caso({ name: 'a'.repeat(201) }, 'name');
      await caso({ value: -1 }, 'value');
      await caso({ value: 1e12 }, 'value');
      await caso({ source: 'sms' }, 'source');
      await caso({ funnelId: 'no-es-un-id' }, 'funnelId');
      await caso({ customFields: { _interno: 'x' } }, 'customFields._interno');
      expect(await prisma.lead.count({ where: { funnelId: n.curso.id } })).toBe(0);
    });

    it('un funnel de otro cliente o inexistente responde 404; sin sesión, 401', async () => {
      const n = await negocio();
      const ajeno = await negocio();
      expect((await post(ajeno.token, '/leads', datos(n))).status).toBe(404);
      expect((await post(n.token, '/leads', datos(n, { funnelId: SIN_ID }))).body.error.code).toBe('FUNNEL_NOT_FOUND');
      expect((await request(app).post('/api/v1/leads').send(datos(n))).status).toBe(401);
      expect(await prisma.lead.count({ where: { funnelId: n.curso.id } })).toBe(0);
    });

    it('queda auditado sin datos personales', async () => {
      const n = await negocio();
      const res = await post(n.token, '/leads', datos(n, { phone: '+52 618 111 2233' }));
      const registros = await prisma.auditLog.findMany({ where: { action: 'lead.create', resourceId: res.body.id } });
      expect(registros).toHaveLength(1);
      // Los ids son UUID al azar y podrían contener «618» por casualidad: se revisa todo lo demás.
      const { id: _id, resourceId: _resource, userId: _user, workspaceId: _workspace, ...contenido } = registros[0]!;
      expect(JSON.stringify(contenido)).not.toMatch(/rosa|correo\.com|618/i);
    });
  });

  describe('PATCH /leads/:id', () => {
    it('cambia de etapa y deja el cambio en la auditoría con la etapa de origen y la de destino', async () => {
      const n = await negocio();
      const creado = await sembrar(n);
      const res = await patch(n.token, `/leads/${creado.id}`, { leadStageId: n.etapas[2]!.id });
      expect(res.status).toBe(200);
      expect(res.body.leadStageId).toBe(n.etapas[2]!.id);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: creado.id } })).leadStageId).toBe(n.etapas[2]!.id);
      const [registro] = await prisma.auditLog.findMany({ where: { action: 'lead.update', resourceId: creado.id } });
      expect(registro?.metadata).toEqual({ fields: ['leadStageId'], fromStageId: n.nuevo.id, toStageId: n.etapas[2]!.id });
    });

    it('pone, redondea y borra el valor estimado', async () => {
      const n = await negocio();
      const creado = await sembrar(n);
      expect((await patch(n.token, `/leads/${creado.id}`, { value: 1999.999 })).body.value).toBe(2000);
      expect((await patch(n.token, `/leads/${creado.id}`, { value: 0 })).body.value).toBe(0);
      expect((await patch(n.token, `/leads/${creado.id}`, { value: null })).body.value).toBeNull();
      expect((await patch(n.token, `/leads/${creado.id}`, { value: -5 })).status).toBe(422);
      expect((await patch(n.token, `/leads/${creado.id}`, { value: '10' })).status).toBe(422);
    });

    it('una etapa de otro negocio o inexistente responde 422 y no mueve nada', async () => {
      const n = await negocio();
      const otro = await negocio();
      const creado = await sembrar(n);
      for (const leadStageId of [otro.nuevo.id, SIN_ID]) {
        const res = await patch(n.token, `/leads/${creado.id}`, { leadStageId });
        expect(res.status).toBe(422);
        expect(res.body.error.details[0].path).toBe('leadStageId');
      }
      expect((await patch(n.token, `/leads/${creado.id}`, { leadStageId: 'no-es-un-id' })).status).toBe(422);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: creado.id } })).leadStageId).toBe(n.nuevo.id);
    });

    it('asigna y quita vendedor; solo alguien con acceso al negocio', async () => {
      const n = await negocio();
      const creado = await sembrar(n);
      const vendedor = await miembro(n.workspace.id, 'vendedor');
      const persona = await prisma.user.findUniqueOrThrow({ where: { email: vendedor.email } });
      const ajeno = await crearNegocio(app, config);
      const ajenoId = (await prisma.user.findUniqueOrThrow({ where: { email: ajeno.email } })).id;

      expect((await patch(n.token, `/leads/${creado.id}`, { assignedTo: persona.id })).body.assignedTo).toBe(persona.id);
      const sinAcceso = await patch(n.token, `/leads/${creado.id}`, { assignedTo: ajenoId });
      expect(sinAcceso.status).toBe(422);
      expect(sinAcceso.body.error.details[0].path).toBe('assignedTo');
      expect((await patch(n.token, `/leads/${creado.id}`, { assignedTo: SIN_ID })).status).toBe(422);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: creado.id } })).assignedTo).toBe(persona.id);
      expect((await patch(n.token, `/leads/${creado.id}`, { assignedTo: null })).body.assignedTo).toBeNull();
    });

    it('corrige nombre, correo y teléfono; siempre queda un correo o un teléfono', async () => {
      const n = await negocio();
      const creado = await sembrar(n, { name: 'Ana', email: 'ana@correo.com', phone: '+52 618 111 2233' });
      const res = await patch(n.token, `/leads/${creado.id}`, { name: 'Ana Pérez', email: ' ANA.P@Correo.com ' });
      expect(res.body).toMatchObject({ name: 'Ana Pérez', email: 'ana.p@correo.com', phone: '+52 618 111 2233' });

      expect((await patch(n.token, `/leads/${creado.id}`, { email: null })).body).toMatchObject({ email: null, phone: '+52 618 111 2233' });
      const sinContacto = await patch(n.token, `/leads/${creado.id}`, { phone: null });
      expect(sinContacto.status).toBe(422);
      expect(sinContacto.body.error.details[0].path).toBe('email');
      expect((await patch(n.token, `/leads/${creado.id}`, { email: null, phone: null })).status).toBe(422);
      expect((await patch(n.token, `/leads/${creado.id}`, { email: 'no-es-correo' })).status).toBe(422);
      expect((await patch(n.token, `/leads/${creado.id}`, { name: null })).body.name).toBeNull();
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: creado.id } })).phone).toBe('+52 618 111 2233');
    });

    it('un cuerpo vacío o con campos que no se pueden cambiar no modifica nada', async () => {
      const n = await negocio();
      const creado = await sembrar(n, { name: 'Ana' });
      expect((await patch(n.token, `/leads/${creado.id}`, {})).status).toBe(422);
      // Campos desconocidos (funnel, fecha, UTM…) se descartan: no se pueden reescribir desde aquí.
      const res = await patch(n.token, `/leads/${creado.id}`, { value: 5, funnelId: n.taller.id, createdAt: '2020-01-01', utm: { utm_source: 'x' } });
      expect(res.status).toBe(200);
      const guardado = await prisma.lead.findUniqueOrThrow({ where: { id: creado.id } });
      expect(guardado.funnelId).toBe(n.curso.id);
      expect(guardado.createdAt.getFullYear()).not.toBe(2020);
      expect(guardado.utm).toBeNull();
    });

    it('un lead inexistente o de otro cliente responde 404 y no se toca', async () => {
      const n = await negocio();
      const ajeno = await crearNegocio(app, config);
      const creado = await sembrar(n);
      expect((await patch(ajeno.token, `/leads/${creado.id}`, { value: 1 })).status).toBe(404);
      expect((await patch(n.token, `/leads/${SIN_ID}`, { value: 1 })).body.error.code).toBe('LEAD_NOT_FOUND');
      expect((await patch(n.token, '/leads/no-es-un-id', { value: 1 })).status).toBe(422);
      expect((await request(app).patch(`/api/v1/leads/${creado.id}`).send({ value: 1 })).status).toBe(401);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: creado.id } })).value).toBeNull();
    });

    it('los cambios no escriben datos personales en la auditoría', async () => {
      const n = await negocio();
      const creado = await sembrar(n, { name: 'Ana Secreta' });
      await patch(n.token, `/leads/${creado.id}`, { name: 'Nombre Nuevo', email: 'nuevo@correo.com', phone: '+52 618 999 8877' });
      const [registro] = await prisma.auditLog.findMany({ where: { action: 'lead.update', resourceId: creado.id } });
      expect(registro?.metadata).toEqual({ fields: ['name', 'email', 'phone'] });
      const { id: _id, resourceId: _resource, userId: _user, workspaceId: _workspace, ...contenido } = registro!;
      expect(JSON.stringify(contenido)).not.toMatch(/secreta|nuevo@|999/i);
    });
  });

  describe('datos guardados fuera de lo normal', () => {
    it('un utm o unos campos personalizados que no son objetos se leen como nulos, sin fallar', async () => {
      const n = await negocio();
      const rara = await sembrar(n, { name: 'Rara', utm: 'texto', customFields: [1, 2] });
      const res = await get(n.token, `/leads/${rara.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Rara', utm: null, customFields: null });
      expect((await lista(n)).body.items[0]).toMatchObject({ utm: null, customFields: null });
    });

    it('un negocio sin ninguna etapa no puede recibir un alta sin etapa: responde 422', async () => {
      const n = await negocio();
      await prisma.leadStage.deleteMany({ where: { workspaceId: n.workspace.id } });
      const res = await post(n.token, '/leads', { funnelId: n.curso.id, email: 'x@correo.com' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PIPELINE_NOT_CONFIGURED');
      expect(await prisma.lead.count({ where: { funnelId: n.curso.id } })).toBe(0);
    });
  });

  describe('permisos', () => {
    it('el diseñador no ve leads (403); el marketing manager, el vendedor y el analista sí', async () => {
      const n = await negocio();
      const creado = await sembrar(n, { name: 'Ana' });
      const disenador = await miembro(n.workspace.id, 'disenador');
      expect((await get(disenador.token, `/leads?workspaceId=${n.workspace.id}`)).status).toBe(403);
      expect((await get(disenador.token, `/leads/${creado.id}`)).status).toBe(403);

      for (const role of ['marketing_manager', 'vendedor', 'analista'] as const) {
        const persona = await miembro(n.workspace.id, role);
        const res = await get(persona.token, `/leads?workspaceId=${n.workspace.id}`);
        expect(res.status, role).toBe(200);
        expect(res.body.total, role).toBe(1);
        expect((await get(persona.token, `/leads/${creado.id}`)).status, role).toBe(200);
      }
    });

    it('el analista solo mira (403 al crear y cambiar); el diseñador tampoco; el vendedor y el marketing manager sí', async () => {
      const n = await negocio();
      const creado = await sembrar(n);
      for (const role of ['analista', 'disenador'] as const) {
        const persona = await miembro(n.workspace.id, role);
        expect((await post(persona.token, '/leads', { funnelId: n.curso.id, email: 'x@correo.com' })).status, role).toBe(403);
        expect((await patch(persona.token, `/leads/${creado.id}`, { value: 1 })).status, role).toBe(403);
      }
      for (const role of ['vendedor', 'marketing_manager'] as const) {
        const persona = await miembro(n.workspace.id, role);
        expect((await post(persona.token, '/leads', { funnelId: n.curso.id, email: `${role}@correo.com` })).status, role).toBe(201);
        expect((await patch(persona.token, `/leads/${creado.id}`, { value: 1 })).status, role).toBe(200);
      }
    });

    it('un negocio de otro cliente responde 404 y sin sesión 401', async () => {
      const n = await negocio();
      const ajeno = await crearNegocio(app, config);
      expect((await get(ajeno.token, `/leads?workspaceId=${n.workspace.id}`)).status).toBe(404);
      expect((await request(app).get(`/api/v1/leads?workspaceId=${n.workspace.id}`)).status).toBe(401);
    });
  });
});
