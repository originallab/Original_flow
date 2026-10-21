import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/services/api';
import { createSession, mockCallback } from '@/services/auth';
import { createFunnel, publishFunnel, saveContent, saveTypeConfig, type Funnel } from '@/services/funnels';
import { BOARD_PAGE_SIZE, listLeads, listLeadStages, updateLead } from '@/services/leads';
import { sendLead } from '@/services/publicPages';
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
const baseDeDatos = () => JSON.parse(localStorage.getItem('of-demo-db')!) as { leads: Record<string, any>[]; leadStages: Record<string, any>[] };

/** Una persona con un negocio y un funnel publicado. */
async function persona(email = 'ana@correo.com', nombreNegocio = 'Mi negocio') {
  const { session: token } = await createSession();
  await mockCallback(token, { email });
  const negocio = await createWorkspace(token, { name: nombreNegocio });
  return { token, negocio };
}
async function publicado(token: string, workspaceId: string, name = 'Curso de datos'): Promise<Funnel> {
  const funnel = await createFunnel(token, { workspaceId, name, objective: 'leads' });
  await saveContent(token, funnel.id, [bloque('encabezado'), bloque('formulario', 'formulario', 2)]);
  await saveTypeConfig(token, funnel.id, FUNNEL_TYPES.leads.initial());
  await publishFunnel(token, funnel.id);
  return funnel;
}
const registrar = (slug: string, datos: Record<string, unknown> = {}) => sendLead(slug, { consent: true, name: 'María Pérez', email: 'maria@correo.com', ...datos } as never);

describe('modo demostración: etapas del tablero', () => {
  it('cada negocio tiene las cinco etapas de siempre, en orden, y la última es la final y la ganada', async () => {
    const { token, negocio } = await persona();
    const etapas = await listLeadStages(token, negocio.id);
    expect(etapas.map((e) => [e.name, e.order, e.isFinal, e.isWon])).toEqual([
      ['Nuevo', 1, false, false],
      ['Contactado', 2, false, false],
      ['Interesado', 3, false, false],
      ['Oportunidad', 4, false, false],
      ['Cliente', 5, true, true],
    ]);
    expect(etapas.every((e) => e.workspaceId === negocio.id)).toBe(true);
  });

  it('pedirlas dos veces no las duplica', async () => {
    const { token, negocio } = await persona();
    await listLeadStages(token, negocio.id);
    await listLeadStages(token, negocio.id);
    expect(baseDeDatos().leadStages).toHaveLength(5);
  });

  it('las etapas de un negocio ajeno o inexistente responden 404, nunca 403', async () => {
    const { negocio } = await persona('ana@correo.com');
    const { token: ajeno } = await persona('beto@correo.com', 'Otro negocio');
    expect((await falla(listLeadStages(ajeno, negocio.id))).status).toBe(404);
    expect((await falla(listLeadStages(ajeno, 'no-existe'))).status).toBe(404);
  });

  it('sin sesión responde 401', async () => {
    const { negocio } = await persona();
    expect((await falla(listLeadStages('token-falso', negocio.id))).status).toBe(401);
  });
});

describe('modo demostración: GET /leads', () => {
  it('el lead que llega de la página entra en la primera etapa, con el nombre de su funnel', async () => {
    const { token, negocio } = await persona();
    const funnel = await publicado(token, negocio.id);
    await registrar(funnel.slug, { phone: '55 1234 5678' });
    const [primera] = await listLeadStages(token, negocio.id);
    const pagina = await listLeads(token, negocio.id);
    expect(pagina).toMatchObject({ total: 1, page: 1, pageSize: BOARD_PAGE_SIZE });
    expect(pagina.items[0]).toMatchObject({
      funnelId: funnel.id,
      funnelName: 'Curso de datos',
      leadStageId: primera!.id,
      name: 'María Pérez',
      email: 'maria@correo.com',
      phone: '55 1234 5678',
      source: 'web_form',
      assignedTo: null,
      value: null,
      utm: null,
    });
    expect(pagina.items[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('trae los datos de origen (UTM) cuando los hay', async () => {
    const { token, negocio } = await persona();
    const funnel = await publicado(token, negocio.id);
    await registrar(funnel.slug, { utm: { utm_source: 'instagram', utm_campaign: 'octubre' } });
    const [lead] = (await listLeads(token, negocio.id)).items;
    expect(lead!.utm).toEqual({ utm_source: 'instagram', utm_campaign: 'octubre' });
  });

  it('del más nuevo al más viejo', async () => {
    const { token, negocio } = await persona();
    const funnel = await publicado(token, negocio.id);
    for (const nombre of ['Primero', 'Segundo', 'Tercero']) {
      await registrar(funnel.slug, { name: nombre, email: `${nombre.toLowerCase()}@correo.com` });
      await new Promise((r) => setTimeout(r, 5));
    }
    expect((await listLeads(token, negocio.id)).items.map((l) => l.name)).toEqual(['Tercero', 'Segundo', 'Primero']);
  });

  it('filtra por funnel y por texto (nombre, correo o teléfono, sin importar mayúsculas)', async () => {
    const { token, negocio } = await persona();
    const a = await publicado(token, negocio.id, 'Curso A');
    const b = await publicado(token, negocio.id, 'Curso B');
    await registrar(a.slug, { name: 'Ana Gómez', email: 'ana@correo.com' });
    await registrar(b.slug, { name: 'Luis Torres', email: 'luis@correo.com', phone: '55 9999 0000' });
    expect((await listLeads(token, negocio.id, { funnelId: b.id })).items.map((l) => l.name)).toEqual(['Luis Torres']);
    expect((await listLeads(token, negocio.id, { q: 'GÓMEZ' })).items.map((l) => l.name)).toEqual(['Ana Gómez']);
    expect((await listLeads(token, negocio.id, { q: 'gomez' })).total).toBe(0);
    expect((await listLeads(token, negocio.id, { q: 'luis@' })).total).toBe(1);
    expect((await listLeads(token, negocio.id, { q: '9999' })).total).toBe(1);
    expect((await listLeads(token, negocio.id, { q: '  ' })).total).toBe(2);
  });

  it('solo trae los leads de los negocios de la persona', async () => {
    const mia = await persona('ana@correo.com', 'Mío');
    const ajena = await persona('beto@correo.com', 'Ajeno');
    await registrar((await publicado(mia.token, mia.negocio.id)).slug);
    await registrar((await publicado(ajena.token, ajena.negocio.id, 'Curso ajeno')).slug, { name: 'Lead ajeno', email: 'x@correo.com' });
    expect((await listLeads(mia.token, mia.negocio.id)).items.map((l) => l.name)).toEqual(['María Pérez']);
    expect((await falla(listLeads(mia.token, ajena.negocio.id))).status).toBe(404);
  });

  it('pedir sin negocio es un error de validación y sin sesión un 401', async () => {
    const { token, negocio } = await persona();
    const sinNegocio = await falla(import('@/services/api').then(({ apiFetch }) => apiFetch('/leads', { token })));
    expect(sinNegocio.status).toBe(422);
    expect((await falla(listLeads('token-falso', negocio.id))).status).toBe(401);
  });

  it('un lead de antes de existir el tablero (sin etapa) cuenta como de la primera', async () => {
    const { token, negocio } = await persona();
    const funnel = await publicado(token, negocio.id);
    await registrar(funnel.slug);
    const db = baseDeDatos();
    delete db.leads[0]!.leadStageId;
    delete db.leads[0]!.value;
    localStorage.setItem('of-demo-db', JSON.stringify(db));
    const [primera] = await listLeadStages(token, negocio.id);
    expect((await listLeads(token, negocio.id)).items[0]).toMatchObject({ leadStageId: primera!.id, value: null });
  });
});

describe('modo demostración: PATCH /leads/:id', () => {
  async function conLead() {
    const { token, negocio } = await persona();
    const funnel = await publicado(token, negocio.id);
    await registrar(funnel.slug);
    const [lead] = (await listLeads(token, negocio.id)).items;
    const etapas = await listLeadStages(token, negocio.id);
    return { token, negocio, lead: lead!, etapas };
  }

  it('pasa el lead a otra etapa y se queda ahí', async () => {
    const { token, negocio, lead, etapas } = await conLead();
    const actualizado = await updateLead(token, lead.id, { leadStageId: etapas[2]!.id });
    expect(actualizado.leadStageId).toBe(etapas[2]!.id);
    expect((await listLeads(token, negocio.id)).items[0]!.leadStageId).toBe(etapas[2]!.id);
    expect((await listLeads(token, negocio.id)).items[0]!.name).toBe('María Pérez');
  });

  it('guarda el valor estimado con dos decimales y lo puede borrar con null', async () => {
    const { token, lead } = await conLead();
    expect((await updateLead(token, lead.id, { value: 1500.456 })).value).toBe(1500.46);
    expect((await updateLead(token, lead.id, { value: 0 })).value).toBe(0);
    expect((await updateLead(token, lead.id, { value: null })).value).toBeNull();
  });

  it('cambia las dos cosas a la vez', async () => {
    const { token, lead, etapas } = await conLead();
    expect(await updateLead(token, lead.id, { leadStageId: etapas[4]!.id, value: 900 })).toMatchObject({ leadStageId: etapas[4]!.id, value: 900 });
  });

  it('rechaza una etapa que no existe o que es de otro negocio', async () => {
    const { token, lead } = await conLead();
    const otro = await persona('beto@correo.com', 'Otro');
    const [ajena] = await listLeadStages(otro.token, otro.negocio.id);
    for (const etapa of ['no-existe', ajena!.id, '']) {
      const error = await falla(updateLead(token, lead.id, { leadStageId: etapa }));
      expect(error.status, etapa).toBe(422);
      expect(error.fieldErrors()).toHaveProperty('leadStageId');
    }
  });

  it.each([[-1], [1e12], [Number.NaN], ['mil' as unknown as number]])('rechaza el valor %s', async (valor) => {
    const { token, lead } = await conLead();
    const error = await falla(updateLead(token, lead.id, { value: valor }));
    expect(error.status).toBe(422);
    expect(error.fieldErrors()).toHaveProperty('value');
  });

  it('no deja mandar la petición vacía', async () => {
    const { token, lead } = await conLead();
    expect((await falla(updateLead(token, lead.id, {}))).status).toBe(422);
  });

  it('un lead ajeno o inexistente responde 404 y sin sesión 401', async () => {
    const { lead, etapas } = await conLead();
    const otro = await persona('beto@correo.com', 'Otro');
    expect((await falla(updateLead(otro.token, lead.id, { leadStageId: etapas[1]!.id }))).status).toBe(404);
    expect((await falla(updateLead(otro.token, 'no-existe', { value: 1 }))).status).toBe(404);
    expect((await falla(updateLead('token-falso', lead.id, { value: 1 }))).status).toBe(401);
  });

  it('un cambio que falla no toca el lead', async () => {
    const { token, negocio, lead } = await conLead();
    await falla(updateLead(token, lead.id, { value: 50, leadStageId: 'no-existe' }));
    expect((await listLeads(token, negocio.id)).items[0]).toMatchObject({ value: null, leadStageId: lead.leadStageId });
  });
});
