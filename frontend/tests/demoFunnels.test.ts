import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '@/services/api';
import { createSession, mockCallback } from '@/services/auth';
import { createFunnel, getFunnel, listFunnels, saveContent, saveDesignSpec, type Funnel } from '@/services/funnels';
import { createWorkspace } from '@/services/workspaces';
import { BLOCKS } from '@/shared/blocks/catalog';
import type { Block } from '@/shared/blocks/types';

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
const boton = (key: string, order = 1, label = 'Ir'): Block => ({ key, type: 'boton', order, content: { label }, style: {} });

describe('modo demostración: funnels', () => {
  it('crea un funnel en borrador, con el contenido vacío y el slug sacado del nombre', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const funnel = await createFunnel(token, { workspaceId, name: 'Curso de Análisis · Inscripción', objective: 'leads' });
    expect(funnel).toMatchObject({
      workspaceId,
      name: 'Curso de Análisis · Inscripción',
      objective: 'leads',
      status: 'draft',
      slug: 'curso-de-analisis-inscripcion',
      currency: 'MXN',
      language: 'es',
      price: null,
      productName: null,
      designSpec: null,
      content: { blocks: [] },
    });
    expect(funnel.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('guarda los datos opcionales que se envían', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const funnel = await createFunnel(token, { workspaceId, name: 'Venta', objective: 'venta', productName: 'Mi curso', price: 4200, currency: 'USD', targetAudience: 'Freelancers', language: 'es-MX' });
    expect(funnel).toMatchObject({ productName: 'Mi curso', price: 4200, currency: 'USD', targetAudience: 'Freelancers', language: 'es-MX' });
  });

  it('un nombre repetido recibe un sufijo para que el slug no se repita', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const uno = await createFunnel(token, { workspaceId, name: 'Mi funnel', objective: 'leads' });
    const dos = await createFunnel(token, { workspaceId, name: 'Mi funnel', objective: 'leads' });
    expect(uno.slug).toBe('mi-funnel');
    expect(dos.slug).toMatch(/^mi-funnel-[0-9a-f]{4}$/);
  });

  it.each(['upsell', 'libre'] as const)('«%s» todavía no se puede crear (422 FUNNEL_TYPE_UNAVAILABLE)', async (objective) => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const error = await falla(createFunnel(token, { workspaceId, name: 'Futuro', objective }));
    expect(error).toMatchObject({ status: 422, code: 'FUNNEL_TYPE_UNAVAILABLE' });
  });

  it('valida los datos como el backend y señala el campo', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const crear = (cuerpo: Record<string, unknown>) => falla(apiFetch('/funnels', { method: 'POST', body: { workspaceId, objective: 'leads', name: 'Ok', ...cuerpo }, token }));
    expect((await crear({ name: '   ' })).fieldErrors()).toHaveProperty('name');
    expect((await crear({ name: 'x'.repeat(121) })).fieldErrors()).toHaveProperty('name');
    expect((await crear({ objective: 'otro' })).fieldErrors()).toHaveProperty('objective');
    expect((await crear({ price: -5 })).fieldErrors()).toHaveProperty('price');
    expect((await crear({ currency: 'EUR' })).fieldErrors()).toHaveProperty('currency');
    expect((await crear({ language: 'español' })).fieldErrors()).toHaveProperty('language');
    expect((await crear({ productName: '' })).fieldErrors()).toHaveProperty('productName');
  });

  it('sin sesión responde 401; con el negocio de otra persona, 404 (nunca 403)', async () => {
    const ana = await persona('ana@correo.com');
    const beto = await persona('beto@correo.com');
    expect((await falla(apiFetch('/funnels?workspaceId=x'))).status).toBe(401);
    expect(await falla(createFunnel(beto.token, { workspaceId: ana.workspaceId, name: 'Colado', objective: 'leads' }))).toMatchObject({ status: 404, code: 'WORKSPACE_NOT_FOUND' });
    expect(await falla(listFunnels(beto.token, ana.workspaceId))).toMatchObject({ status: 404, code: 'WORKSPACE_NOT_FOUND' });
  });

  it('lista del más nuevo al más viejo y sin el contenido pesado', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const primero = await createFunnel(token, { workspaceId, name: 'Primero', objective: 'leads' });
    await new Promise((r) => setTimeout(r, 5));
    const segundo = await createFunnel(token, { workspaceId, name: 'Segundo', objective: 'citas' });
    await saveContent(token, primero.id, [boton('a')]);
    const lista = await listFunnels(token, workspaceId);
    expect(lista.map((f) => f.name)).toEqual(['Segundo', 'Primero']);
    expect(lista[1]).not.toHaveProperty('content');
    expect(lista[1]).not.toHaveProperty('designSpec');
    expect(lista[1]).not.toHaveProperty('typeConfig');
    expect(lista[0]).toMatchObject({ id: segundo.id, status: 'draft', objective: 'citas' });
  });

  it('cada persona solo ve los funnels de sus negocios', async () => {
    const ana = await persona('ana@correo.com');
    const beto = await persona('beto@correo.com');
    await createFunnel(ana.token, { workspaceId: ana.workspaceId, name: 'De Ana', objective: 'leads' });
    expect(await listFunnels(beto.token, beto.workspaceId)).toEqual([]);
  });

  it('abrir un funnel lo devuelve completo; el de otra persona responde 404 FUNNEL_NOT_FOUND', async () => {
    const ana = await persona('ana@correo.com');
    const beto = await persona('beto@correo.com');
    const funnel = await createFunnel(ana.token, { workspaceId: ana.workspaceId, name: 'De Ana', objective: 'leads' });
    expect(await getFunnel(ana.token, funnel.id)).toEqual(funnel);
    expect(await falla(getFunnel(beto.token, funnel.id))).toMatchObject({ status: 404, code: 'FUNNEL_NOT_FOUND' });
    expect(await falla(getFunnel(ana.token, 'no-existe'))).toMatchObject({ status: 404, code: 'FUNNEL_NOT_FOUND' });
  });

  it('guarda el contenido, lo devuelve con su fecha y lo conserva al volver a abrirlo', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const funnel = await createFunnel(token, { workspaceId, name: 'Con contenido', objective: 'leads' });
    const respuesta = await saveContent(token, funnel.id, [boton('a', 1, 'Primero'), { ...boton('b', 2), type: 'encabezado', content: { title: 'Hola' } }]);
    expect(respuesta.blocks.map((b) => b.key)).toEqual(['a', 'b']);
    expect(respuesta.updatedAt >= funnel.updatedAt).toBe(true);
    const abierto = await getFunnel(token, funnel.id);
    expect(abierto.content.blocks).toHaveLength(2);
    expect(abierto.content.blocks[0]?.content).toEqual({ label: 'Primero' });
  });

  it('el contenido nuevo reemplaza al anterior y el estilo faltante queda como {}', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const funnel = await createFunnel(token, { workspaceId, name: 'Reemplazo', objective: 'leads' });
    await saveContent(token, funnel.id, [boton('a'), boton('b', 2)]);
    const sinEstilo = { key: 'c', type: 'boton', order: 1, content: { label: 'Solo' } } as unknown as Block;
    await saveContent(token, funnel.id, [sinEstilo]);
    const abierto = await getFunnel(token, funnel.id);
    expect(abierto.content.blocks).toEqual([{ key: 'c', type: 'boton', order: 1, content: { label: 'Solo' }, style: {} }]);
  });

  it('un bloque inválido responde 422 con la ruta del campo y no guarda nada', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const funnel = await createFunnel(token, { workspaceId, name: 'Inválido', objective: 'leads' });
    await saveContent(token, funnel.id, [boton('a', 1, 'Guardado')]);
    const error = await falla(saveContent(token, funnel.id, [boton('a'), { key: 'h', type: 'encabezado', order: 2, content: {}, style: {} }]));
    expect(error.status).toBe(422);
    expect(error.fieldErrors()).toHaveProperty(['blocks.1.content.title']);
    expect((await getFunnel(token, funnel.id)).content.blocks[0]?.content).toEqual({ label: 'Guardado' });
  });

  it('rechaza claves repetidas y más de 60 bloques', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const funnel = await createFunnel(token, { workspaceId, name: 'Límites', objective: 'leads' });
    expect((await falla(saveContent(token, funnel.id, [boton('a'), boton('a', 2)]))).fieldErrors()).toHaveProperty(['blocks.1.key']);
    const muchos = Array.from({ length: 61 }, (_, i) => boton(`b${i}`, i + 1));
    expect((await falla(saveContent(token, funnel.id, muchos))).fieldErrors()).toHaveProperty('blocks');
  });

  it('el contenido de un funnel ajeno no se puede guardar (404)', async () => {
    const ana = await persona('ana@correo.com');
    const beto = await persona('beto@correo.com');
    const funnel = await createFunnel(ana.token, { workspaceId: ana.workspaceId, name: 'De Ana', objective: 'leads' });
    expect(await falla(saveContent(beto.token, funnel.id, [boton('a')]))).toMatchObject({ status: 404 });
  });

  it('guarda el diseño (plantilla, paleta y tipografías) y valida lo que llega', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const funnel = await createFunnel(token, { workspaceId, name: 'Diseño', objective: 'leads' });
    const paleta = { primary: '#0E7A63', secondary: '#0A4A3C', accent: '#F2B544', background: '#EAF4F0', text: '#0F1F1A' };
    const respuesta = await saveDesignSpec(token, funnel.id, { template: 'claridad', palette: paleta, fonts: { heading: 'Montserrat', body: 'Inter' } });
    expect(respuesta.designSpec.template).toBe('claridad');
    expect((await getFunnel(token, funnel.id)).designSpec).toEqual({ template: 'claridad', palette: paleta, fonts: { heading: 'Montserrat', body: 'Inter' } });

    const diseno = (cuerpo: Record<string, unknown>) => falla(apiFetch(`/funnels/${funnel.id}/design-spec`, { method: 'PUT', body: cuerpo, token }));
    expect((await diseno({ template: 'inventada' })).fieldErrors()).toHaveProperty('template');
    expect((await diseno({ template: 'claridad', palette: { ...paleta, primary: 'rojo' } })).fieldErrors()).toHaveProperty(['palette.primary']);
    expect((await diseno({ template: 'claridad', fonts: { heading: 'Mi<fuente>', body: 'Inter' } })).fieldErrors()).toHaveProperty(['fonts.heading']);
    expect((await saveDesignSpec(token, funnel.id, { template: 'minimal' })).designSpec).toEqual({ template: 'minimal' });
  });

  it('los contenidos iniciales de todos los bloques que se pueden agregar se guardan sin errores', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const funnel = await createFunnel(token, { workspaceId, name: 'Todos los bloques', objective: 'leads' });
    const bloques: Block[] = Object.values(BLOCKS).map((def, i) => ({ key: `${def.type}-1`, type: def.type, order: i + 1, content: def.create(), style: {} }));
    const guardado = await saveContent(token, funnel.id, bloques);
    expect(guardado.blocks).toHaveLength(bloques.length);
  });

  it('lo creado sobrevive a recargar (se guarda en el navegador)', async () => {
    const { token, workspaceId } = await persona('ana@correo.com');
    const funnel: Funnel = await createFunnel(token, { workspaceId, name: 'Persistente', objective: 'leads' });
    const crudo = localStorage.getItem('of-demo-db');
    expect(crudo).toContain(funnel.id);
    expect((await listFunnels(token, workspaceId)).map((f) => f.id)).toEqual([funnel.id]);
  });
});
