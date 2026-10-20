import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/services/api';
import { createSession, mockCallback } from '@/services/auth';
import {
  createFunnel,
  getFunnel,
  listCtas,
  listFunnels,
  publishFunnel,
  saveContent,
  saveTypeConfig,
  unpublishFunnel,
  updateCta,
  updateFunnel,
  type FunnelObjective,
} from '@/services/funnels';
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

async function persona(email: string) {
  const { session } = await createSession();
  await mockCallback(session, { email });
  const negocio = await createWorkspace(session, { name: `Negocio de ${email}` });
  return { token: session, workspaceId: negocio.id };
}
const falla = async (promesa: Promise<unknown>) => (await promesa.catch((e: unknown) => e)) as ApiError;
const bloque = (type: BlockType, key: string = type, order = 1, content?: Record<string, unknown>): Block => ({ key, type, order, content: content ?? BLOCKS[type].create(), style: {} });

async function nuevo(email = 'ana@correo.com', objective: FunnelObjective = 'leads', name = 'Mi funnel') {
  const { token, workspaceId } = await persona(email);
  const funnel = await createFunnel(token, { workspaceId, name, objective });
  return { token, workspaceId, funnel };
}
/** Un funnel de captar leads completo, listo para publicar. */
async function listoParaPublicar(email = 'ana@correo.com') {
  const ctx = await nuevo(email);
  await saveContent(ctx.token, ctx.funnel.id, [bloque('encabezado'), bloque('formulario', 'formulario', 2)]);
  await saveTypeConfig(ctx.token, ctx.funnel.id, FUNNEL_TYPES.leads.initial());
  return ctx;
}

describe('modo demostración: editar los datos de un funnel', () => {
  it('cambia solo lo que se envía y devuelve el funnel completo', async () => {
    const { token, funnel } = await nuevo();
    const cambiado = await updateFunnel(token, funnel.id, { name: '  Otro nombre  ', productName: 'Mi curso', price: 1200, currency: 'USD', targetAudience: 'Freelancers' });
    expect(cambiado).toMatchObject({ id: funnel.id, name: 'Otro nombre', productName: 'Mi curso', price: 1200, currency: 'USD', targetAudience: 'Freelancers', slug: funnel.slug });
    expect(cambiado).toHaveProperty('content');
    expect((await getFunnel(token, funnel.id)).name).toBe('Otro nombre');
  });

  it('con null se borran los opcionales', async () => {
    const { token, funnel } = await nuevo();
    await updateFunnel(token, funnel.id, { productName: 'x', price: 5, targetAudience: 'y' });
    const vacio = await updateFunnel(token, funnel.id, { productName: null, price: null, targetAudience: null });
    expect(vacio).toMatchObject({ productName: null, price: null, targetAudience: null });
  });

  it('valida como el backend: al menos un campo, nombre, divisa, precio e idioma', async () => {
    const { token, funnel } = await nuevo();
    const cambiar = (cuerpo: Record<string, unknown>) => falla(updateFunnel(token, funnel.id, cuerpo));
    expect((await cambiar({})).status).toBe(422);
    expect((await cambiar({ name: '  ' })).fieldErrors()).toHaveProperty('name');
    expect((await cambiar({ currency: 'EUR' })).fieldErrors()).toHaveProperty('currency');
    expect((await cambiar({ price: -1 })).fieldErrors()).toHaveProperty('price');
    expect((await cambiar({ language: 'español' })).fieldErrors()).toHaveProperty('language');
    expect((await cambiar({ productName: null, name: null })).fieldErrors()).toHaveProperty('name');
  });

  it.each(['ab', 'Mayúsculas', 'con espacios', '-guion', 'doble--guion', 'x'.repeat(61)])('el slug «%s» no es válido', async (slug) => {
    const { token, funnel } = await nuevo();
    expect((await falla(updateFunnel(token, funnel.id, { slug }))).fieldErrors()).toHaveProperty('slug');
  });

  it('un slug válido se guarda y uno repetido responde 409 SLUG_TAKEN (el propio no cuenta como repetido)', async () => {
    const { token, workspaceId, funnel } = await nuevo();
    const otro = await createFunnel(token, { workspaceId, name: 'Otro', objective: 'leads' });
    expect((await updateFunnel(token, funnel.id, { slug: 'mi-curso-de-datos' })).slug).toBe('mi-curso-de-datos');
    expect((await updateFunnel(token, funnel.id, { slug: 'mi-curso-de-datos' })).slug).toBe('mi-curso-de-datos');
    expect(await falla(updateFunnel(token, otro.id, { slug: 'mi-curso-de-datos' }))).toMatchObject({ status: 409, code: 'SLUG_TAKEN' });
  });

  it('el funnel de otra persona responde 404', async () => {
    const ana = await nuevo('ana@correo.com');
    const beto = await persona('beto@correo.com');
    expect((await falla(updateFunnel(beto.token, ana.funnel.id, { name: 'Robado' }))).status).toBe(404);
  });
});

describe('modo demostración: ajustes del tipo de funnel', () => {
  it('guarda ajustes válidos, descarta los campos que el tipo no define y los devuelve al abrir el funnel', async () => {
    const { token, funnel } = await nuevo();
    const respuesta = await saveTypeConfig(token, funnel.id, { thankYou: { message: 'Gracias', otra: 1 }, basura: true });
    expect(respuesta.typeConfig).toEqual({ thankYou: { message: 'Gracias' } });
    expect((await getFunnel(token, funnel.id)).typeConfig).toEqual({ thankYou: { message: 'Gracias' } });
  });

  it('los ajustes incompletos o inválidos responden 422 con la ruta del campo y no se guardan', async () => {
    const { token, funnel } = await nuevo();
    const error = await falla(saveTypeConfig(token, funnel.id, { thankYou: { message: '' } }));
    expect(error.status).toBe(422);
    expect(error.fieldErrors()).toHaveProperty(['thankYou.message']);
    expect((await getFunnel(token, funnel.id)).typeConfig).toBeNull();
  });

  it('cada tipo valida con sus propios ajustes', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const citas = await createFunnel(token, { workspaceId, name: 'Citas', objective: 'citas' });
    expect((await falla(saveTypeConfig(token, citas.id, { calendarUrl: 'hola', durationMin: 2, confirmationMessage: 'ok' }))).fieldErrors()).toMatchObject({ calendarUrl: expect.any(String), durationMin: expect.any(String) });
    expect((await saveTypeConfig(token, citas.id, { calendarUrl: 'https://cal.test/a', durationMin: 30, confirmationMessage: 'ok' })).typeConfig).toMatchObject({ durationMin: 30 });
  });

  it('el funnel de otra persona responde 404', async () => {
    const ana = await nuevo('ana@correo.com');
    const beto = await persona('beto@correo.com');
    expect((await falla(saveTypeConfig(beto.token, ana.funnel.id, FUNNEL_TYPES.leads.initial()))).status).toBe(404);
  });
});

describe('modo demostración: llamados a la acción (CTA)', () => {
  it('al guardar el contenido nace un CTA por cada botón y formulario, con su texto y su acción por defecto', async () => {
    const { token, funnel } = await nuevo();
    await saveContent(token, funnel.id, [bloque('encabezado'), bloque('boton', 'boton', 2, { label: 'Empezar' }), bloque('formulario', 'formulario', 3)]);
    const ctas = await listCtas(token, funnel.id);
    expect(ctas.map((c) => [c.blockKey, c.label, c.actionType, c.destination])).toEqual([
      ['boton', 'Empezar', 'scroll_to', null],
      ['formulario', 'Enviar', 'form_submit', null],
    ]);
  });

  it('en un funnel que cobra, el botón nace como botón de pago', async () => {
    const { token, funnel } = await nuevo('ana@correo.com', 'venta');
    await saveContent(token, funnel.id, [bloque('boton')]);
    expect((await listCtas(token, funnel.id))[0]?.actionType).toBe('checkout');
  });

  it('cambiar el texto del botón actualiza el CTA y conserva el destino editado; quitar el bloque lo borra', async () => {
    const { token, funnel } = await nuevo();
    await saveContent(token, funnel.id, [bloque('boton', 'boton', 1, { label: 'Uno' })]);
    await updateCta(token, funnel.id, 'boton', { actionType: 'url', destination: 'https://x.test/a' });
    await saveContent(token, funnel.id, [bloque('boton', 'boton', 1, { label: 'Dos' })]);
    expect((await listCtas(token, funnel.id))[0]).toMatchObject({ label: 'Dos', actionType: 'url', destination: 'https://x.test/a' });
    await saveContent(token, funnel.id, [bloque('encabezado')]);
    expect(await listCtas(token, funnel.id)).toEqual([]);
  });

  it('si un bloque cambia de botón a formulario, su CTA se reinicia', async () => {
    const { token, funnel } = await nuevo();
    await saveContent(token, funnel.id, [bloque('boton', 'cta')]);
    await updateCta(token, funnel.id, 'cta', { actionType: 'url', destination: 'https://x.test' });
    await saveContent(token, funnel.id, [bloque('formulario', 'cta')]);
    expect((await listCtas(token, funnel.id))[0]).toMatchObject({ actionType: 'form_submit', destination: null });
  });

  it('cambia el destino y el seguimiento; si cambia la acción sin mandar destino, el anterior se borra', async () => {
    const { token, funnel } = await nuevo();
    await saveContent(token, funnel.id, [bloque('boton')]);
    expect(await updateCta(token, funnel.id, 'boton', { actionType: 'url', destination: 'https://x.test/a', trackingId: 'camp-1' })).toMatchObject({ actionType: 'url', destination: 'https://x.test/a', trackingId: 'camp-1' });
    expect(await updateCta(token, funnel.id, 'boton', { actionType: 'scroll_to' })).toMatchObject({ actionType: 'scroll_to', destination: null, trackingId: 'camp-1' });
    expect((await updateCta(token, funnel.id, 'boton', { trackingId: null })).trackingId).toBeNull();
  });

  it('un formulario solo puede ser de envío, y un funnel que no cobra no tiene botón de pago', async () => {
    const { token, funnel } = await nuevo();
    await saveContent(token, funnel.id, [bloque('boton'), bloque('formulario', 'formulario', 2)]);
    expect(await falla(updateCta(token, funnel.id, 'formulario', { actionType: 'url', destination: 'https://x.test' }))).toMatchObject({ status: 422, code: 'CTA_ACTION_NOT_ALLOWED' });
    expect(await falla(updateCta(token, funnel.id, 'boton', { actionType: 'checkout' }))).toMatchObject({ status: 422, code: 'CTA_CHECKOUT_NOT_ALLOWED' });
    expect(await falla(updateCta(token, funnel.id, 'boton', { actionType: 'form_submit' }))).toMatchObject({ code: 'CTA_ACTION_NOT_ALLOWED' });
  });

  it('el destino de un enlace debe ser http o https', async () => {
    const { token, funnel } = await nuevo();
    await saveContent(token, funnel.id, [bloque('boton')]);
    expect(await falla(updateCta(token, funnel.id, 'boton', { actionType: 'url', destination: 'ftp://x.test' }))).toMatchObject({ status: 422, code: 'CTA_DESTINATION_INVALID' });
    expect(await falla(updateCta(token, funnel.id, 'boton', { actionType: 'url', destination: 'sin espacios no' }))).toMatchObject({ code: 'CTA_DESTINATION_INVALID' });
  });

  it('un CTA que no existe responde 404, y sin cambios o con una acción desconocida responde 422', async () => {
    const { token, funnel } = await nuevo();
    await saveContent(token, funnel.id, [bloque('boton')]);
    expect(await falla(updateCta(token, funnel.id, 'no-existe', { trackingId: 'x' }))).toMatchObject({ status: 404, code: 'CTA_NOT_FOUND' });
    expect((await falla(updateCta(token, funnel.id, 'boton', {}))).status).toBe(422);
    expect((await falla(updateCta(token, funnel.id, 'boton', { actionType: 'volar' as never }))).fieldErrors()).toHaveProperty('actionType');
  });

  it('cada persona solo ve y cambia los CTA de sus funnels', async () => {
    const ana = await nuevo('ana@correo.com');
    await saveContent(ana.token, ana.funnel.id, [bloque('boton')]);
    const beto = await persona('beto@correo.com');
    expect((await falla(listCtas(beto.token, ana.funnel.id))).status).toBe(404);
    expect((await falla(updateCta(beto.token, ana.funnel.id, 'boton', { trackingId: 'x' }))).status).toBe(404);
  });
});

describe('modo demostración: publicar y despublicar', () => {
  it('un funnel completo se publica y queda como publicado en la lista', async () => {
    const { token, workspaceId, funnel } = await listoParaPublicar();
    const publicado = await publishFunnel(token, funnel.id);
    expect(publicado.status).toBe('published');
    expect((await getFunnel(token, funnel.id)).status).toBe('published');
    expect((await listFunnels(token, workspaceId))[0]?.status).toBe('published');
  });

  it('si falta algo responde 422 FUNNEL_NOT_READY con la lista de lo pendiente, y no publica', async () => {
    const { token, funnel } = await nuevo();
    const error = await falla(publishFunnel(token, funnel.id));
    expect(error).toMatchObject({ status: 422, code: 'FUNNEL_NOT_READY' });
    const faltan = (error.details as { missing: { code: string; message: string }[] }).missing;
    expect(faltan.map((p) => p.code)).toEqual(['CONTENT_EMPTY', 'TYPE_CONFIG_INCOMPLETE', 'FORM_MISSING']);
    expect(faltan[0]?.message).toBe('La página no tiene ningún bloque');
    expect((await getFunnel(token, funnel.id)).status).toBe('draft');
  });

  it('un botón de enlace sin destino impide publicar, y con destino sí se puede', async () => {
    const { token, funnel } = await listoParaPublicar();
    await saveContent(token, funnel.id, [bloque('encabezado'), bloque('formulario', 'formulario', 2), bloque('boton', 'boton', 3)]);
    await updateCta(token, funnel.id, 'boton', { actionType: 'url' });
    expect(((await falla(publishFunnel(token, funnel.id))).details as { missing: { code: string }[] }).missing.map((p) => p.code)).toEqual(['CTA_DESTINATION_MISSING']);
    await updateCta(token, funnel.id, 'boton', { destination: 'https://x.test' });
    expect((await publishFunnel(token, funnel.id)).status).toBe('published');
  });

  it('publicar dos veces no hace nada raro (idempotente) y despublicar vuelve a borrador sin borrar nada', async () => {
    const { token, funnel } = await listoParaPublicar();
    await publishFunnel(token, funnel.id);
    expect((await publishFunnel(token, funnel.id)).status).toBe('published');
    const borrador = await unpublishFunnel(token, funnel.id);
    expect(borrador.status).toBe('draft');
    expect(borrador.content.blocks).toHaveLength(2);
    expect((await unpublishFunnel(token, funnel.id)).status).toBe('draft');
  });

  it('un funnel ya publicado sigue publicado aunque se edite su contenido', async () => {
    const { token, funnel } = await listoParaPublicar();
    await publishFunnel(token, funnel.id);
    await saveContent(token, funnel.id, [bloque('encabezado')]);
    expect((await getFunnel(token, funnel.id)).status).toBe('published');
  });

  it('un funnel de venta todavía no se puede publicar: Original Pay no está conectado', async () => {
    const { token, funnel } = await nuevo('ana@correo.com', 'venta');
    await saveContent(token, funnel.id, [bloque('encabezado'), bloque('boton', 'boton', 2)]);
    await saveTypeConfig(token, funnel.id, FUNNEL_TYPES.venta.initial());
    await updateFunnel(token, funnel.id, { price: 1490 });
    const faltan = ((await falla(publishFunnel(token, funnel.id))).details as { missing: { code: string }[] }).missing.map((p) => p.code);
    expect(faltan).toEqual(['PAYMENTS_NOT_CONNECTED']);
  });

  it('el funnel de otra persona responde 404 al publicar y al despublicar', async () => {
    const ana = await listoParaPublicar('ana@correo.com');
    const beto = await persona('beto@correo.com');
    expect((await falla(publishFunnel(beto.token, ana.funnel.id))).status).toBe(404);
    expect((await falla(unpublishFunnel(beto.token, ana.funnel.id))).status).toBe(404);
    expect((await getFunnel(ana.token, ana.funnel.id)).status).toBe('draft');
  });
});
