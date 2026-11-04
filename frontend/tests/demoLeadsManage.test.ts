import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api';
import { createLead, listLeads, listLeadStages, updateLead } from '@/services/leads';
import { startDemo } from './helpers/demoApp';
import { negocioConLeads } from './helpers/leadsApp';
import { editarBaseDeDemostracion } from './helpers/publicApp';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const falla = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('Debía fallar');
};
const campos = (err: ApiError) => Object.keys(err.fieldErrors()).sort();

async function negocio() {
  const { token, workspace, funnels } = await negocioConLeads([{ name: 'Ana', email: 'ana@correo.com', phone: '618 111 2233' }]);
  const etapas = await listLeadStages(token, workspace.id);
  const existente = (await listLeads(token, workspace.id)).items[0]!;
  return { token, workspace, funnels, etapas, existente };
}

describe('POST /leads en la demostración (alta a mano)', () => {
  it('entra a la primera etapa, con el correo en minúsculas, sin UTM y con el valor a dos decimales', async () => {
    const { token, workspace, funnels, etapas } = await negocio();
    const lead = await createLead(token, { funnelId: funnels[1].id, name: ' Rosa ', email: '  ROSA@Correo.com ', value: 100.555 });
    expect(lead).toMatchObject({
      funnelId: funnels[1].id,
      funnelName: 'Taller de ventas',
      leadStageId: etapas[0]!.id,
      name: 'Rosa',
      email: 'rosa@correo.com',
      phone: null,
      source: 'web_form',
      utm: null,
      assignedTo: null,
      customFields: null,
      value: 100.56,
    });
    expect((await listLeads(token, workspace.id)).items.map((item) => item.name)).toContain('Rosa');
  });

  it('con etapa elegida, WhatsApp y solo teléfono', async () => {
    const { token, funnels, etapas } = await negocio();
    const lead = await createLead(token, { funnelId: funnels[0].id, phone: '+52 618 111 9999', leadStageId: etapas[2]!.id, source: 'whatsapp' });
    expect(lead).toMatchObject({ leadStageId: etapas[2]!.id, source: 'whatsapp', phone: '+52 618 111 9999', email: null, name: null });
  });

  it('aparece primero en la lista (es el más nuevo)', async () => {
    const { token, workspace, funnels } = await negocio();
    await createLead(token, { funnelId: funnels[0].id, name: 'Nueva', email: 'nueva@correo.com' });
    expect((await listLeads(token, workspace.id)).items[0]?.name).toBe('Nueva');
  });

  it('rechaza con 422 lo que no es válido y no guarda nada', async () => {
    const { token, workspace, funnels } = await negocio();
    const antes = (await listLeads(token, workspace.id)).total;
    const casos: [Parameters<typeof createLead>[1] | Record<string, unknown>, string[]][] = [
      [{ funnelId: funnels[0].id, name: 'Sin contacto' }, ['email']],
      [{ funnelId: funnels[0].id, email: 'no-es-correo' }, ['email']],
      [{ funnelId: funnels[0].id, phone: 'abc' }, ['phone']],
      [{ funnelId: funnels[0].id, email: 'a@correo.com', name: '' }, ['name']],
      [{ funnelId: funnels[0].id, email: 'a@correo.com', value: -1 }, ['value']],
      [{ funnelId: funnels[0].id, email: 'a@correo.com', leadStageId: 'no-existe' }, ['leadStageId']],
      [{ funnelId: funnels[0].id, email: 'a@correo.com', source: 'sms' }, ['source']],
    ];
    for (const [cuerpo, esperados] of casos) {
      const err = await falla(createLead(token, cuerpo as Parameters<typeof createLead>[1]));
      expect(err.status, JSON.stringify(cuerpo)).toBe(422);
      expect(campos(err), JSON.stringify(cuerpo)).toEqual(esperados);
    }
    expect((await listLeads(token, workspace.id)).total).toBe(antes);
  });

  it('un funnel inexistente o de otra persona responde 404', async () => {
    const { token } = await negocio();
    const err = await falla(createLead(token, { funnelId: 'no-existe', email: 'a@correo.com' }));
    expect(err.status).toBe(404);
    expect(err.code).toBe('FUNNEL_NOT_FOUND');
  });

  it('una etapa de otro negocio no vale', async () => {
    const { token, funnels } = await negocio();
    const otro = await startDemo({ email: 'otra@correo.com', workspace: 'Otro negocio' });
    const ajenas = await listLeadStages(otro.token, otro.workspace.id);
    const err = await falla(createLead(token, { funnelId: funnels[0].id, email: 'a@correo.com', leadStageId: ajenas[0]!.id }));
    expect(err.status).toBe(422);
  });
});

describe('PATCH /leads/:id en la demostración (corregir y asignar)', () => {
  it('corrige nombre, correo y teléfono (el correo en minúsculas y recortado)', async () => {
    const { token, existente } = await negocio();
    const lead = await updateLead(token, existente.id, { name: ' Ana Pérez ', email: ' ANA.P@Correo.com ', phone: ' 618 999 0000 ' });
    expect(lead).toMatchObject({ name: 'Ana Pérez', email: 'ana.p@correo.com', phone: '618 999 0000' });
  });

  it('con null borra el dato, mientras quede un correo o un teléfono', async () => {
    const { token, workspace, existente } = await negocio();
    expect(await updateLead(token, existente.id, { email: null })).toMatchObject({ email: null, phone: '618 111 2233' });
    expect(await updateLead(token, existente.id, { name: null })).toMatchObject({ name: null });
    const err = await falla(updateLead(token, existente.id, { phone: null }));
    expect(err.status).toBe(422);
    expect(campos(err)).toEqual(['email']);
    expect((await listLeads(token, workspace.id)).items.find((item) => item.id === existente.id)?.phone).toBe('618 111 2233');
  });

  it('no deja borrar el correo y el teléfono a la vez', async () => {
    const { token, existente } = await negocio();
    const err = await falla(updateLead(token, existente.id, { email: null, phone: null }));
    expect(err.status).toBe(422);
    expect(err.fieldErrors().email).toMatch(/conservar/i);
  });

  it('valida el formato y el largo', async () => {
    const { token, existente } = await negocio();
    expect(campos(await falla(updateLead(token, existente.id, { email: 'no-es-correo' })))).toEqual(['email']);
    expect(campos(await falla(updateLead(token, existente.id, { phone: 'abc' })))).toEqual(['phone']);
    expect(campos(await falla(updateLead(token, existente.id, { name: '' })))).toEqual(['name']);
  });

  it('asigna a alguien del equipo con cuenta, y se le quita con null', async () => {
    const { token, existente } = await negocio();
    const lead = await updateLead(token, existente.id, { assignedTo: 'demo-ana@correo.com' });
    expect(lead.assignedTo).toBe('demo-ana@correo.com');
    expect((await updateLead(token, existente.id, { assignedTo: null })).assignedTo).toBeNull();
  });

  it('no asigna a alguien sin acceso al negocio ni a alguien que solo está invitado', async () => {
    const { token, workspace, existente } = await negocio();
    const ajena = await falla(updateLead(token, existente.id, { assignedTo: 'demo-otra@correo.com' }));
    expect(ajena.status).toBe(422);
    expect(campos(ajena)).toEqual(['assignedTo']);

    editarBaseDeDemostracion((db) => {
      db.members.push({ id: 'm1', role: 'vendedor', status: 'invited', userId: null, email: 'invitado@correo.com', name: null, clientId: null, workspaceId: workspace.id, createdAt: new Date().toISOString() });
    });
    expect((await falla(updateLead(token, existente.id, { assignedTo: 'invitado@correo.com' }))).status).toBe(422);
  });

  it('un cuerpo vacío responde 422 y no cambia nada', async () => {
    const { token, existente } = await negocio();
    const err = await falla(updateLead(token, existente.id, {}));
    expect(err.status).toBe(422);
  });

  it('un lead de otra persona responde 404', async () => {
    const { existente } = await negocio();
    const otra = await startDemo({ email: 'otra@correo.com', workspace: 'Otro negocio' });
    expect((await falla(updateLead(otra.token, existente.id, { name: 'Intruso' }))).status).toBe(404);
  });
});
