import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api';
import { createStage, deleteStage, listLeads, listLeadStages, updateLead, updateStage } from '@/services/leads';
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
const tablero = async (token: string, workspaceId: string) => {
  const etapas = await listLeadStages(token, workspaceId);
  return { nombres: etapas.map((e) => e.name), ordenes: etapas.map((e) => e.order), etapas };
};
const seguidas = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('etapas del tablero en la demostración', () => {
  it('una etapa nueva sin posición entra justo antes de la final y los órdenes quedan seguidos', async () => {
    const { token, workspace } = await startDemo();
    const creada = await createStage(token, workspace.id, { name: '  Propuesta enviada ' });
    expect(creada).toMatchObject({ workspaceId: workspace.id, name: 'Propuesta enviada', isFinal: false, isWon: false });
    expect(await tablero(token, workspace.id)).toMatchObject({ nombres: ['Nuevo', 'Contactado', 'Interesado', 'Oportunidad', 'Propuesta enviada', 'Cliente'], ordenes: seguidas(6) });
  });

  it('con posición entra ahí y recorre las demás; pasada de la final se queda antes de ella', async () => {
    const { token, workspace } = await startDemo();
    await createStage(token, workspace.id, { name: 'Segunda', order: 2 });
    await createStage(token, workspace.id, { name: 'Primera', order: 1 });
    await createStage(token, workspace.id, { name: 'Casi al final', order: 99 });
    expect(await tablero(token, workspace.id)).toMatchObject({
      nombres: ['Primera', 'Nuevo', 'Segunda', 'Contactado', 'Interesado', 'Oportunidad', 'Casi al final', 'Cliente'],
      ordenes: seguidas(8),
    });
  });

  it('rechaza con 422 un nombre vacío o largo y una posición inválida, sin crear nada', async () => {
    const { token, workspace } = await startDemo();
    for (const cuerpo of [{ name: '' }, { name: '   ' }, { name: 'a'.repeat(61) }, { name: 'X', order: 0 }, { name: 'X', order: 1.5 }, { name: 'X', order: 101 }]) {
      const err = await falla(createStage(token, workspace.id, cuerpo));
      expect(err.status, JSON.stringify(cuerpo)).toBe(422);
    }
    expect((await tablero(token, workspace.id)).nombres).toHaveLength(5);
  });

  it('renombra una etapa, también la final', async () => {
    const { token, workspace } = await startDemo();
    const { etapas } = await tablero(token, workspace.id);
    expect(await updateStage(token, etapas[1]!.id, { name: ' Primer contacto ' })).toMatchObject({ name: 'Primer contacto', order: 2 });
    expect(await updateStage(token, etapas[4]!.id, { name: 'Ganado' })).toMatchObject({ name: 'Ganado', order: 5, isFinal: true, isWon: true });
  });

  it('mueve una etapa hacia arriba y hacia abajo con los órdenes seguidos; nunca después de la final', async () => {
    const { token, workspace } = await startDemo();
    const { etapas } = await tablero(token, workspace.id);
    const [nuevo, contactado, interesado] = etapas as [(typeof etapas)[number], (typeof etapas)[number], (typeof etapas)[number]];
    await updateStage(token, interesado.id, { order: 1 });
    expect(await tablero(token, workspace.id)).toMatchObject({ nombres: ['Interesado', 'Nuevo', 'Contactado', 'Oportunidad', 'Cliente'], ordenes: seguidas(5) });
    await updateStage(token, nuevo.id, { order: 4 });
    expect(await tablero(token, workspace.id)).toMatchObject({ nombres: ['Interesado', 'Contactado', 'Oportunidad', 'Nuevo', 'Cliente'], ordenes: seguidas(5) });
    expect((await updateStage(token, contactado.id, { order: 99 })).order).toBe(4);
    expect((await tablero(token, workspace.id)).nombres.at(-1)).toBe('Cliente');
  });

  it('renombrar y mover a la vez hace las dos cosas; mover a donde ya está no cambia nada', async () => {
    const { token, workspace } = await startDemo();
    const { etapas } = await tablero(token, workspace.id);
    expect(await updateStage(token, etapas[2]!.id, { name: 'Calificado', order: 1 })).toMatchObject({ name: 'Calificado', order: 1 });
    await updateStage(token, etapas[0]!.id, { order: 2 });
    expect((await tablero(token, workspace.id)).nombres).toEqual(['Calificado', 'Nuevo', 'Contactado', 'Oportunidad', 'Cliente']);
  });

  it('la etapa final no se mueve (409), aunque sí puede quedarse donde está', async () => {
    const { token, workspace } = await startDemo();
    const { etapas } = await tablero(token, workspace.id);
    const err = await falla(updateStage(token, etapas[4]!.id, { order: 1 }));
    expect(err.status).toBe(409);
    expect(err.code).toBe('STAGE_PROTECTED');
    expect((await updateStage(token, etapas[4]!.id, { order: 5 })).order).toBe(5);
  });

  it('un cuerpo vacío o con datos inválidos responde 422', async () => {
    const { token, workspace } = await startDemo();
    const { etapas } = await tablero(token, workspace.id);
    for (const cuerpo of [{}, { name: '' }, { name: 'a'.repeat(61) }, { order: 0 }, { order: 1.5 }, { order: 101 }]) {
      expect((await falla(updateStage(token, etapas[1]!.id, cuerpo))).status, JSON.stringify(cuerpo)).toBe(422);
    }
  });

  it('quita una etapa vacía y cierra el hueco', async () => {
    const { token, workspace } = await startDemo();
    const { etapas } = await tablero(token, workspace.id);
    await deleteStage(token, etapas[1]!.id);
    expect(await tablero(token, workspace.id)).toMatchObject({ nombres: ['Nuevo', 'Interesado', 'Oportunidad', 'Cliente'], ordenes: seguidas(4) });
  });

  it('no quita la final ni la ganada (409), ni una etapa con leads, y dice cuántos son', async () => {
    const { token, workspace } = await negocioConLeads([{ email: 'a@correo.com' }, { email: 'b@correo.com' }]);
    const { etapas } = await tablero(token, workspace.id);
    const protegida = await falla(deleteStage(token, etapas[4]!.id));
    expect(protegida.status).toBe(409);
    expect(protegida.code).toBe('STAGE_PROTECTED');

    const conLeads = await falla(deleteStage(token, etapas[0]!.id));
    expect(conLeads.status).toBe(409);
    expect(conLeads.code).toBe('STAGE_NOT_EMPTY');
    expect(conLeads.details).toEqual({ leads: 2 });
    expect((await tablero(token, workspace.id)).nombres).toHaveLength(5);

    // Cuando los leads se mueven, la etapa ya se puede quitar.
    for (const lead of (await listLeads(token, workspace.id)).items) await updateLead(token, lead.id, { leadStageId: etapas[1]!.id });
    await deleteStage(token, etapas[0]!.id);
    expect((await tablero(token, workspace.id)).nombres).not.toContain('Nuevo');
  });

  it('la etapa final no se quita aunque no sea la ganada, ni la ganada aunque no sea la final', async () => {
    const { token, workspace } = await startDemo();
    const { etapas } = await tablero(token, workspace.id);
    editarBaseDeDemostracion((db) => {
      const final = db.leadStages.find((e: { id: string }) => e.id === etapas[4]!.id);
      const otra = db.leadStages.find((e: { id: string }) => e.id === etapas[3]!.id);
      final.isWon = false;
      otra.isWon = true;
    });
    expect((await falla(deleteStage(token, etapas[4]!.id))).code).toBe('STAGE_PROTECTED');
    expect((await falla(deleteStage(token, etapas[3]!.id))).code).toBe('STAGE_PROTECTED');
    expect((await tablero(token, workspace.id)).nombres).toHaveLength(5);
  });

  it('un lead de antes de existir el tablero (sin etapa) cuenta como de la primera: esa etapa no se quita', async () => {
    const { token, workspace } = await negocioConLeads([{ email: 'viejo@correo.com' }]);
    const { etapas } = await tablero(token, workspace.id);
    editarBaseDeDemostracion((db) => {
      delete db.leads[0].leadStageId;
    });
    const err = await falla(deleteStage(token, etapas[0]!.id));
    expect(err.code).toBe('STAGE_NOT_EMPTY');
    expect(err.details).toEqual({ leads: 1 });
    // En cambio, otra etapa vacía sí se quita.
    await deleteStage(token, etapas[1]!.id);
  });

  it('los leads de otro negocio no cuentan: un lead viejo ajeno no impide quitar mi primera etapa', async () => {
    const { token, workspace } = await startDemo();
    const { etapas } = await tablero(token, workspace.id);
    await negocioConLeads([{ email: 'ajeno@correo.com' }], { email: 'otra@correo.com' });
    editarBaseDeDemostracion((db) => {
      delete db.leads[0].leadStageId;
    });
    await deleteStage(token, etapas[0]!.id);
    expect((await tablero(token, workspace.id)).nombres).not.toContain('Nuevo');
  });

  it('lo de otra persona responde 404', async () => {
    const { token, workspace } = await startDemo();
    const otra = await startDemo({ email: 'otra@correo.com', workspace: 'Otro negocio' });
    const propias = await listLeadStages(otra.token, otra.workspace.id);
    const ajenas = await listLeadStages(token, workspace.id);
    // Etapas que sí existen pero son de otra persona: ni se renombran, ni se mueven, ni se quitan.
    const intruso = await falla(updateStage(otra.token, ajenas[1]!.id, { name: 'Intruso' }));
    expect(intruso.status).toBe(404);
    expect(intruso.code).toBe('STAGE_NOT_FOUND');
    expect((await falla(deleteStage(otra.token, ajenas[1]!.id))).status).toBe(404);
    expect((await listLeadStages(token, workspace.id)).map((e) => e.name)).toEqual(ajenas.map((e) => e.name));
    expect((await falla(createStage(otra.token, workspace.id, { name: 'X' }))).status).toBe(404);
    expect((await falla(updateStage(otra.token, 'no-existe', { name: 'X' }))).status).toBe(404);
    expect((await falla(deleteStage(otra.token, 'no-existe'))).status).toBe(404);
    expect(propias).toHaveLength(5);
  });
});
