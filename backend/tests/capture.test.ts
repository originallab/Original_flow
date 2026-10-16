import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { emailUnico } from './helpers/auth.js';
import { testDatabaseUrl } from './helpers/db.js';
import { crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

const FORM = { fields: [{ name: 'email', label: 'Correo', type: 'email', required: true }], submitLabel: 'Enviar' };

const TYPE_CONFIGS = {
  leads: { thankYou: { message: 'Gracias por registrarte', redirectUrl: 'https://ejemplo.com/gracias' } },
  citas: { calendarUrl: 'https://cal.ejemplo.com/yo', durationMin: 30, confirmationMessage: 'Cita agendada' },
  magnet: { resourceFileId: 'file_recurso', deliveryMessage: 'Descárgalo aquí' },
  webinar: { startsAt: '2026-11-01T18:00:00-06:00', timezone: 'America/Mexico_City', joinUrl: 'https://zoom.ejemplo.com/j/1' },
  aplicacion: { questions: [{ id: 'motivo', label: 'Motivo', type: 'text' }], successMessage: 'Postulación recibida' },
} as const;

describe.skipIf(!testDatabaseUrl)('captura pública: leads y eventos', () => {
  const { app, prisma, config } = buildTestApp();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const publicar = (token: string, id: string) => request(app).post(`/api/v1/funnels/${id}/publish`).set(encabezados(token));
  const lead = (slug: string, body: object) => request(app).post(`/api/v1/public/funnels/${slug}/leads`).send(body);
  const eventos = (slug: string, body: object) => request(app).post(`/api/v1/public/funnels/${slug}/events`).send(body);
  const bodyLead = (extra: object = {}) => ({ name: 'María', email: emailUnico(), phone: '+52 618 123 4567', consent: true, ...extra });

  /** Un funnel del tipo pedido, completo y publicado. */
  async function publicado(objective: keyof typeof TYPE_CONFIGS = 'leads') {
    const n = await crearNegocio(app, config);
    const creado = await request(app).post('/api/v1/funnels').set(encabezados(n.token)).send({ workspaceId: n.workspace.id, name: 'Curso de datos', objective });
    const funnel = creado.body as { id: string; slug: string };
    await request(app)
      .put(`/api/v1/funnels/${funnel.id}/content`)
      .set(encabezados(n.token))
      .send({ blocks: [{ key: 'form', type: 'formulario', order: 1, content: FORM, style: {} }] });
    await request(app).put(`/api/v1/funnels/${funnel.id}/type-config`).set(encabezados(n.token)).send(TYPE_CONFIGS[objective]);
    const res = await publicar(n.token, funnel.id);
    expect(res.status).toBe(200);
    return { ...n, funnel };
  }

  describe('POST /public/funnels/:slug/leads', () => {
    it('guarda el lead en la primera etapa del workspace con sus datos, utm y consentimiento, y registra lead_created', async () => {
      const f = await publicado('leads');
      const body = bodyLead({
        utm: { utm_source: 'instagram', utm_campaign: 'octubre' },
        customFields: { interes: 'datos', presupuesto: 5000, acepta: true },
      });
      const res = await lead(f.funnel.slug, body);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);

      const guardado = await prisma.lead.findFirstOrThrow({ where: { funnelId: f.funnel.id }, include: { leadStage: true } });
      expect(guardado).toMatchObject({ name: 'María', email: body.email, phone: '+52 618 123 4567', source: 'web_form' });
      expect(guardado.leadStage).toMatchObject({ name: 'Nuevo', order: 1, workspaceId: f.workspace.id });
      expect(guardado.utm).toEqual({ utm_source: 'instagram', utm_campaign: 'octubre' });
      expect(guardado.customFields).toMatchObject({ interes: 'datos', presupuesto: 5000, acepta: true });
      expect((guardado.customFields as Record<string, string>)._consentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const evento = await prisma.event.findFirstOrThrow({ where: { funnelId: f.funnel.id, type: 'lead_created' } });
      expect(evento).toMatchObject({ leadId: guardado.id, properties: { source: 'instagram' } });
    });

    it('normaliza el correo a minúsculas', async () => {
      const f = await publicado();
      const correo = emailUnico();
      await lead(f.funnel.slug, bodyLead({ email: `  ${correo.toUpperCase()} ` }));
      expect((await prisma.lead.findFirstOrThrow({ where: { funnelId: f.funnel.id } })).email).toBe(correo);
    });

    it('sin consentimiento, o con consent distinto de true, responde 422 y no guarda nada', async () => {
      const f = await publicado();
      for (const consent of [undefined, false, 'true', 1]) {
        const res = await lead(f.funnel.slug, bodyLead({ consent }));
        expect(res.status).toBe(422);
      }
      expect(await prisma.lead.count({ where: { funnelId: f.funnel.id } })).toBe(0);
    });

    it('sin email ni teléfono responde 422; con solo uno de los dos, 201', async () => {
      const f = await publicado();
      expect((await lead(f.funnel.slug, { name: 'Sin contacto', consent: true })).status).toBe(422);
      expect((await lead(f.funnel.slug, { consent: true, email: emailUnico() })).status).toBe(201);
      expect((await lead(f.funnel.slug, { consent: true, phone: '6181234567' })).status).toBe(201);
    });

    it('rechaza un correo o un teléfono inválidos con 422', async () => {
      const f = await publicado();
      expect((await lead(f.funnel.slug, bodyLead({ email: 'no-es-correo' }))).status).toBe(422);
      expect((await lead(f.funnel.slug, bodyLead({ phone: 'abc' }))).status).toBe(422);
    });

    it('un funnel en borrador, inexistente o con slug mal formado responden el mismo 404', async () => {
      const f = await publicado();
      await request(app).post(`/api/v1/funnels/${f.funnel.id}/unpublish`).set(encabezados(f.token));
      const borrador = await lead(f.funnel.slug, bodyLead());
      const inexistente = await lead('no-existe-este-slug', bodyLead());
      const malFormado = await lead('MAL_FORMADO', bodyLead());
      expect([borrador.status, inexistente.status, malFormado.status]).toEqual([404, 404, 404]);
      expect(borrador.body.error).toEqual(inexistente.body.error);
      expect(await prisma.lead.count({ where: { funnelId: f.funnel.id } })).toBe(0);
    });

    it('ignora funnelId, etapa y fuente enviados por el visitante: el lead va a donde corresponde', async () => {
      const f = await publicado();
      const otro = await publicado();
      const etapaAjena = await prisma.leadStage.findFirstOrThrow({ where: { workspaceId: otro.workspace.id, name: 'Cliente' } });
      await lead(f.funnel.slug, bodyLead({ funnelId: otro.funnel.id, leadStageId: etapaAjena.id, source: 'whatsapp', assignedTo: randomUUID() }));
      expect(await prisma.lead.count({ where: { funnelId: otro.funnel.id } })).toBe(0);
      const guardado = await prisma.lead.findFirstOrThrow({ where: { funnelId: f.funnel.id }, include: { leadStage: true } });
      expect(guardado).toMatchObject({ source: 'web_form', assignedTo: null });
      expect(guardado.leadStage.workspaceId).toBe(f.workspace.id);
    });

    it('descarta parámetros utm desconocidos y rechaza campos personalizados peligrosos', async () => {
      const f = await publicado();
      await lead(f.funnel.slug, bodyLead({ utm: { utm_source: 'tiktok', otra_cosa: 'x' } }));
      expect((await prisma.lead.findFirstOrThrow({ where: { funnelId: f.funnel.id } })).utm).toEqual({ utm_source: 'tiktok' });

      const muchos = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`campo${i}`, 'x']));
      const malos = [{ _consentAt: 'falso' }, { 'con espacio': 'x' }, { anidado: { a: 1 } }, { largo: 'x'.repeat(1001) }, muchos];
      for (const customFields of malos) {
        expect((await lead(f.funnel.slug, bodyLead({ customFields }))).status).toBe(422);
      }
    });

    it('el visitante no puede falsificar el sello de consentimiento', async () => {
      const f = await publicado();
      await lead(f.funnel.slug, bodyLead());
      const guardado = await prisma.lead.findFirstOrThrow({ where: { funnelId: f.funnel.id } });
      expect(new Date((guardado.customFields as Record<string, string>)._consentAt as string).getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it('si el workspace no tiene etapas responde 422 y no guarda nada', async () => {
      const f = await publicado();
      await prisma.leadStage.deleteMany({ where: { workspaceId: f.workspace.id } });
      const res = await lead(f.funnel.slug, bodyLead());
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PIPELINE_NOT_CONFIGURED');
      expect(await prisma.lead.count({ where: { funnelId: f.funnel.id } })).toBe(0);
    });

    for (const [tipo, esperado] of [
      ['leads', { message: 'Gracias por registrarte', redirectUrl: 'https://ejemplo.com/gracias' }],
      ['citas', { message: 'Cita agendada', redirectUrl: 'https://cal.ejemplo.com/yo' }],
      ['magnet', { message: 'Descárgalo aquí', resourceFileId: 'file_recurso' }],
      ['webinar', { joinUrl: 'https://zoom.ejemplo.com/j/1', startsAt: '2026-11-01T18:00:00-06:00', timezone: 'America/Mexico_City' }],
      ['aplicacion', { message: 'Postulación recibida' }],
    ] as const) {
      it(`un funnel de ${tipo} devuelve al visitante lo que ve después de registrarse`, async () => {
        const f = await publicado(tipo);
        const res = await lead(f.funnel.slug, bodyLead());
        expect(res.body.next).toEqual(esperado);
      });
    }

    it('no escribe el nombre, correo ni teléfono del visitante en los logs ni en la auditoría', async () => {
      const f = await publicado();
      const registrado: string[] = [];
      const espiaOut = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (registrado.push(String(chunk)), true));
      const espiaErr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => (registrado.push(String(chunk)), true));
      const ctx = buildTestApp({ LOG_LEVEL: 'debug' });
      const correo = emailUnico();
      try {
        const res = await request(ctx.app)
          .post(`/api/v1/public/funnels/${f.funnel.slug}/leads`)
          .send(bodyLead({ name: 'Nombre Secreto', email: correo, phone: '+52 999 888 7777' }));
        expect(res.status).toBe(201);
      } finally {
        espiaOut.mockRestore();
        espiaErr.mockRestore();
        await ctx.prisma.$disconnect();
      }
      const logs = registrado.join('');
      expect(logs).toContain('request');
      for (const dato of ['Nombre Secreto', correo, '999 888 7777']) {
        expect(logs).not.toContain(dato);
      }
      const auditoria = JSON.stringify(await prisma.auditLog.findMany({ where: { workspaceId: f.workspace.id } }));
      expect(auditoria).not.toContain(correo);
    });

    it('responde 429 al pasar el límite de leads por minuto', async () => {
      const f = await publicado();
      const ctx = buildTestApp({ RATE_LIMIT_LEADS_PER_MINUTE: '2' });
      try {
        const enviar = () => request(ctx.app).post(`/api/v1/public/funnels/${f.funnel.slug}/leads`).send(bodyLead());
        expect((await enviar()).status).toBe(201);
        expect((await enviar()).status).toBe(201);
        const bloqueada = await enviar();
        expect(bloqueada.status).toBe(429);
        expect(await prisma.lead.count({ where: { funnelId: f.funnel.id } })).toBe(2);
      } finally {
        await ctx.prisma.$disconnect();
      }
    });

    it('permite el preflight de CORS del navegador solo a los orígenes públicos configurados', async () => {
      const ctx = buildTestApp({ PUBLIC_CORS_ORIGINS: 'https://paginas.ejemplo.com' });
      try {
        const preflight = (origen: string) =>
          request(ctx.app)
            .options('/api/v1/public/funnels/x/leads')
            .set('Origin', origen)
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'content-type');
        expect((await preflight('https://paginas.ejemplo.com')).headers['access-control-allow-origin']).toBe('https://paginas.ejemplo.com');
        expect((await preflight('https://otro.com')).headers['access-control-allow-origin']).toBeUndefined();
      } finally {
        await ctx.prisma.$disconnect();
      }
    });
  });

  describe('POST /public/funnels/:slug/events', () => {
    it('guarda el lote de eventos en el funnel y responde 202 con cuántos aceptó', async () => {
      const f = await publicado();
      const res = await eventos(f.funnel.slug, {
        events: [
          { type: 'page_view', properties: { source: 'instagram' } },
          { type: 'section_view', properties: { section: 'beneficios' } },
          { type: 'button_click', properties: { blockKey: 'cta-1' } },
        ],
      });
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ accepted: 3 });
      const guardados = await prisma.event.findMany({ where: { funnelId: f.funnel.id }, orderBy: { type: 'asc' } });
      expect(guardados.map((e) => e.type)).toEqual(['button_click', 'page_view', 'section_view']);
      expect(guardados.find((e) => e.type === 'page_view')?.properties).toEqual({ source: 'instagram' });
    });

    it('los eventos de la página no traen lead asociado y solo conservan las propiedades permitidas', async () => {
      const f = await publicado();
      await eventos(f.funnel.slug, { events: [{ type: 'page_view', properties: { source: 'x', email: 'a@b.com', cualquiera: 'dato' } }] });
      const evento = await prisma.event.findFirstOrThrow({ where: { funnelId: f.funnel.id } });
      expect(evento.leadId).toBeNull();
      expect(evento.properties).toEqual({ source: 'x' });
    });

    it('un evento sin propiedades se guarda con propiedades vacías', async () => {
      const f = await publicado();
      await eventos(f.funnel.slug, { events: [{ type: 'page_view' }] });
      expect((await prisma.event.findFirstOrThrow({ where: { funnelId: f.funnel.id } })).properties).toEqual({});
    });

    it('rechaza los eventos que solo genera el servidor y no guarda ni los válidos del mismo lote', async () => {
      const f = await publicado();
      for (const type of ['lead_created', 'payment_completed', 'checkout_started', 'conversion', 'inventado']) {
        const res = await eventos(f.funnel.slug, { events: [{ type: 'page_view' }, { type }] });
        expect(res.status).toBe(422);
      }
      expect(await prisma.event.count({ where: { funnelId: f.funnel.id } })).toBe(0);
    });

    it('rechaza un lote vacío, uno de más de 20 eventos y propiedades que no son texto', async () => {
      const f = await publicado();
      const evento = { type: 'page_view' };
      expect((await eventos(f.funnel.slug, { events: [] })).status).toBe(422);
      expect((await eventos(f.funnel.slug, { events: Array.from({ length: 21 }, () => evento) })).status).toBe(422);
      expect((await eventos(f.funnel.slug, { events: Array.from({ length: 20 }, () => evento) })).status).toBe(202);
      expect((await eventos(f.funnel.slug, { events: [{ type: 'page_view', properties: { source: { a: 1 } } }] })).status).toBe(422);
    });

    it('un funnel en borrador o inexistente responde 404 y no guarda nada', async () => {
      const f = await publicado();
      await request(app).post(`/api/v1/funnels/${f.funnel.id}/unpublish`).set(encabezados(f.token));
      expect((await eventos(f.funnel.slug, { events: [{ type: 'page_view' }] })).status).toBe(404);
      expect((await eventos('no-existe-este-slug', { events: [{ type: 'page_view' }] })).status).toBe(404);
      expect(await prisma.event.count({ where: { funnelId: f.funnel.id } })).toBe(0);
    });

    it('un cuerpo mayor a 100 kb responde 413', async () => {
      const f = await publicado();
      const res = await eventos(f.funnel.slug, { events: [{ type: 'page_view', properties: { source: 'x'.repeat(200_000) } }] });
      expect(res.status).toBe(413);
    });
  });
});
