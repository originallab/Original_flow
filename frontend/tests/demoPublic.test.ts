import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/services/api';
import { createSession, mockCallback } from '@/services/auth';
import { createFunnel, publishFunnel, saveContent, saveTypeConfig, unpublishFunnel, updateCta, updateFunnel, type Funnel, type FunnelObjective } from '@/services/funnels';
import { getPublicPage, sendEvents, sendLead } from '@/services/publicPages';
import { createWorkspace } from '@/services/workspaces';
import { BLOCKS } from '@/shared/blocks/catalog';
import type { Block, BlockType } from '@/shared/blocks/types';
import { FUNNEL_TYPES } from '@/shared/funnelTypes';

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true');
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Sin servidor'));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const bloque = (type: BlockType, key: string = type, order = 1): Block => ({ key, type, order, content: BLOCKS[type].create(), style: {} });
const falla = async (promesa: Promise<unknown>) => (await promesa.catch((e: unknown) => e)) as ApiError;
const baseDeDatos = () => JSON.parse(localStorage.getItem('of-demo-db')!) as { leads: Record<string, any>[]; events: Record<string, any>[] };

const CONFIGS: Record<string, Record<string, unknown>> = {
  leads: { thankYou: { message: '¡Gracias!', redirectUrl: 'https://gracias.test' } },
  citas: { calendarUrl: 'https://cal.test/ana', durationMin: 30, confirmationMessage: 'Cita reservada' },
  magnet: { resourceFileId: 'archivo-1', deliveryMessage: 'Aquí está tu guía' },
  webinar: { startsAt: '2030-01-01T18:00:00.000Z', timezone: 'America/Mexico_City', joinUrl: 'https://meet.test/evento', agenda: [] },
  aplicacion: { questions: [{ id: 'motivo', label: '¿Por qué?', type: 'text', required: false }], successMessage: 'Recibimos tu aplicación' },
};

/** Una persona con un funnel publicado del tipo pedido. */
async function publicado(objective: FunnelObjective = 'leads', email = 'ana@correo.com') {
  const { session: token } = await createSession();
  await mockCallback(token, { email });
  const negocio = await createWorkspace(token, { name: 'Mi negocio' });
  const funnel: Funnel = await createFunnel(token, { workspaceId: negocio.id, name: `Funnel ${objective}`, objective });
  await saveContent(token, funnel.id, [bloque('encabezado'), bloque('formulario', 'formulario', 2), bloque('boton', 'boton', 3)]);
  await saveTypeConfig(token, funnel.id, CONFIGS[objective] ?? FUNNEL_TYPES[objective].initial());
  await publishFunnel(token, funnel.id);
  return { token, funnel, slug: funnel.slug };
}

describe('modo demostración: GET /public/pages/:slug', () => {
  it('devuelve lo necesario para dibujar la página, sin ids, sin ajustes del tipo y sin la marca interna', async () => {
    const { slug, token, funnel } = await publicado('leads');
    await updateCta(token, funnel.id, 'boton', { actionType: 'url', destination: 'https://oferta.test' });
    const pagina = await getPublicPage(slug);
    expect(Object.keys(pagina).sort()).toEqual(['content', 'ctas', 'currency', 'designSpec', 'language', 'name', 'objective', 'price', 'seo', 'slug']);
    expect(pagina).toMatchObject({ slug, name: 'Funnel leads', objective: 'leads', language: 'es', currency: 'MXN', price: null, designSpec: null });
    expect(pagina.content.blocks).toHaveLength(3);
    expect(pagina.ctas.map((c) => [c.blockKey, c.actionType, c.destination])).toEqual([
      ['formulario', 'form_submit', null],
      ['boton', 'url', 'https://oferta.test'],
    ]);
    expect(pagina.ctas[0]).not.toHaveProperty('id');
    expect(JSON.stringify(pagina)).not.toContain('gracias.test'); // los ajustes del tipo son para quien ya se registró
  });

  it('un borrador, un slug inexistente y un slug mal formado responden exactamente lo mismo (404 PAGE_NOT_FOUND)', async () => {
    const { token, funnel, slug } = await publicado('leads');
    await unpublishFunnel(token, funnel.id);
    const errores = [await falla(getPublicPage(slug)), await falla(getPublicPage('no-existe')), await falla(getPublicPage('Mal Formado!')), await falla(getPublicPage('a'.repeat(120)))];
    for (const error of errores) expect(error).toMatchObject({ status: 404, code: 'PAGE_NOT_FOUND', message: 'Página no encontrada' });
  });

  it('no pide sesión', async () => {
    const { slug } = await publicado('leads');
    expect(await getPublicPage(slug)).toHaveProperty('slug', slug);
  });

  it('un cambio en el contenido se ve al instante, y la página vuelve a verse al republicar', async () => {
    const { token, funnel, slug } = await publicado('leads');
    await saveContent(token, funnel.id, [bloque('encabezado'), bloque('formulario', 'formulario', 2)]);
    expect((await getPublicPage(slug)).content.blocks).toHaveLength(2);
    await unpublishFunnel(token, funnel.id);
    expect((await falla(getPublicPage(slug))).status).toBe(404);
    await publishFunnel(token, funnel.id);
    expect((await getPublicPage(slug)).slug).toBe(slug);
  });

  it('si cambia el slug, la dirección vieja deja de funcionar', async () => {
    const { token, funnel, slug } = await publicado('leads');
    await updateFunnel(token, funnel.id, { slug: 'mi-nueva-direccion' });
    expect((await falla(getPublicPage(slug))).status).toBe(404);
    expect((await getPublicPage('mi-nueva-direccion')).slug).toBe('mi-nueva-direccion');
  });
});

describe('modo demostración: POST /public/funnels/:slug/leads', () => {
  const lead = { name: 'María', email: 'MARIA@correo.com', consent: true };

  it('guarda el lead y responde ok con lo que sigue según el tipo de funnel', async () => {
    const esperados: Record<string, unknown> = {
      leads: { message: '¡Gracias!', redirectUrl: 'https://gracias.test' },
      citas: { message: 'Cita reservada', redirectUrl: 'https://cal.test/ana' },
      magnet: { message: 'Aquí está tu guía', resourceFileId: 'archivo-1' },
      webinar: { joinUrl: 'https://meet.test/evento', startsAt: '2030-01-01T18:00:00.000Z', timezone: 'America/Mexico_City' },
      aplicacion: { message: 'Recibimos tu aplicación' },
    };
    for (const [i, tipo] of Object.keys(esperados).entries()) {
      const { slug } = await publicado(tipo as FunnelObjective, `persona${i}@correo.com`);
      expect(await sendLead(slug, lead)).toEqual({ ok: true, next: esperados[tipo] });
    }
  });

  it('guarda el lead normalizado, con constancia del consentimiento, y registra el evento «lead_created»', async () => {
    const { slug, funnel } = await publicado('leads');
    await sendLead(slug, { ...lead, customFields: { motivo: 'hola' }, utm: { utm_source: 'instagram', utm_campaign: 'octubre' } });
    const { leads, events } = baseDeDatos();
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ funnelId: funnel.id, name: 'María', email: 'maria@correo.com', source: 'web_form', utm: { utm_source: 'instagram', utm_campaign: 'octubre' } });
    expect(leads[0]!.customFields.motivo).toBe('hola');
    expect(leads[0]!.customFields._consentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(events.filter((e) => e.type === 'lead_created')).toEqual([expect.objectContaining({ funnelId: funnel.id, properties: { source: 'instagram' } })]);
  });

  it('el visitante no decide a dónde va el lead ni puede falsificar el consentimiento', async () => {
    const { slug, funnel } = await publicado('leads');
    await sendLead(slug, { ...lead, funnelId: 'otro-funnel', source: 'api', customFields: { motivo: 'x' } } as never);
    const guardado = baseDeDatos().leads[0]!;
    expect(guardado.funnelId).toBe(funnel.id);
    expect(guardado.source).toBe('web_form');
    expect(guardado).not.toHaveProperty('funnelId', 'otro-funnel');
    const falso = await sendLead(slug, { ...lead, customFields: { _consentAt: 'ayer' } as never }).catch((e: ApiError) => e);
    expect((falso as ApiError).status).toBe(422); // el guion bajo inicial es de uso interno
  });

  it('exige consentimiento, y correo o teléfono, y dice en qué campo está cada problema', async () => {
    const { slug } = await publicado('leads');
    expect((await falla(sendLead(slug, { ...lead, consent: false }))).fieldErrors()).toHaveProperty('consent');
    expect((await falla(sendLead(slug, { name: 'María', consent: true }))).fieldErrors()).toHaveProperty('email');
    expect((await falla(sendLead(slug, { email: 'mal', consent: true }))).fieldErrors()).toHaveProperty('email');
    expect((await falla(sendLead(slug, { phone: 'abc', consent: true }))).fieldErrors()).toHaveProperty('phone');
    expect(baseDeDatos().leads).toHaveLength(0);
  });

  it('un funnel en borrador o inexistente responde 404 y no guarda nada', async () => {
    const { token, funnel, slug } = await publicado('leads');
    await unpublishFunnel(token, funnel.id);
    expect((await falla(sendLead(slug, lead))).status).toBe(404);
    expect((await falla(sendLead('no-existe', lead))).status).toBe(404);
    expect(baseDeDatos().leads).toHaveLength(0);
  });

  it('el lead de un funnel no aparece en otro', async () => {
    const uno = await publicado('leads', 'uno@correo.com');
    const dos = await publicado('leads', 'dos@correo.com');
    await sendLead(uno.slug, lead);
    expect(baseDeDatos().leads.every((l) => l.funnelId === uno.funnel.id)).toBe(true);
    expect(baseDeDatos().leads.some((l) => l.funnelId === dos.funnel.id)).toBe(false);
  });
});

describe('modo demostración: POST /public/funnels/:slug/events', () => {
  it('acepta un lote de eventos y responde cuántos aceptó', async () => {
    const { slug, funnel } = await publicado('leads');
    const respuesta = await sendEvents(slug, [{ type: 'page_view', properties: { source: 'instagram' } }, { type: 'section_view', properties: { section: 'beneficios' } }, { type: 'button_click', properties: { blockKey: 'boton' } }]);
    expect(respuesta).toEqual({ accepted: 3 });
    expect(baseDeDatos().events.filter((e) => e.funnelId === funnel.id).map((e) => e.type)).toEqual(['page_view', 'section_view', 'button_click']);
  });

  it('solo conserva source, section y blockKey, como texto recortado; lo demás se descarta', async () => {
    const { slug } = await publicado('leads');
    await sendEvents(slug, [{ type: 'page_view', properties: { source: 's'.repeat(300), email: 'maria@correo.com', blockKey: 5, section: '  inicio  ' } as never }]);
    expect(baseDeDatos().events[0]!.properties).toEqual({ source: 's'.repeat(100), section: 'inicio' });
  });

  it('un evento sin propiedades se acepta', async () => {
    const { slug } = await publicado('leads');
    expect(await sendEvents(slug, [{ type: 'page_view' }])).toEqual({ accepted: 1 });
  });

  it.each(['lead_created', 'payment_completed', 'conversion', 'checkout_started', 'otro'])('el tipo «%s» solo lo genera el servidor: se rechaza todo el lote', async (tipo) => {
    const { slug } = await publicado('leads');
    const error = await falla(sendEvents(slug, [{ type: 'page_view' }, { type: tipo as never }]));
    expect(error.status).toBe(422);
    expect(error.fieldErrors()).toHaveProperty(['events.1.type']);
    expect(baseDeDatos().events).toHaveLength(0);
  });

  it('un lote vacío o de más de 20 eventos se rechaza; de exactamente 20 se acepta', async () => {
    const { slug } = await publicado('leads');
    expect((await falla(sendEvents(slug, []))).status).toBe(422);
    expect((await falla(sendEvents(slug, Array.from({ length: 21 }, () => ({ type: 'page_view' as const }))))).status).toBe(422);
    expect(await sendEvents(slug, Array.from({ length: 20 }, () => ({ type: 'page_view' as const })))).toEqual({ accepted: 20 });
  });

  it('un borrador responde 404', async () => {
    const { token, funnel, slug } = await publicado('leads');
    await unpublishFunnel(token, funnel.id);
    expect((await falla(sendEvents(slug, [{ type: 'page_view' }]))).status).toBe(404);
  });
});
