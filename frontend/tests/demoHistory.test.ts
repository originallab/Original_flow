import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/services/api';
import { getFunnel, listCtas, publishFunnel, saveContent, saveDesignSpec, unpublishFunnel, updateFunnel, type Funnel } from '@/services/funnels';
import { listHistory, restoreVersion, saveVersion } from '@/services/history';
import { MAX_LABEL } from '@/shared/history';
import { block, seedFunnel, startDemo } from './helpers/demoApp';
import { editarBaseDeDemostracion } from './helpers/publicApp';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const falla = async (promesa: Promise<unknown>) => (await promesa.catch((e: unknown) => e)) as ApiError;
const pausa = () => new Promise((r) => setTimeout(r, 3));

async function conFunnel() {
  const ctx = await startDemo();
  const creado = await seedFunnel(ctx.token, ctx.workspace, { name: 'Curso de Excel', brief: { result: 'Ahorra 5 horas a la semana' } });
  // `seedFunnel` devuelve el funnel como se creó (sin contenido): se vuelve a leer ya armado.
  const funnel = await getFunnel(ctx.token, creado.id);
  return { ...ctx, funnel };
}
const titulo = (f: Funnel) => String(f.content.blocks.find((b) => b.key === 'encabezado')?.content.title);
const conTitulo = (f: Funnel, title: string) => f.content.blocks.map((b) => (b.key === 'encabezado' ? { ...b, content: { ...b.content, title } } : b));

describe('modo demostración: publicar guarda una versión', () => {
  it('publicar guarda «Publicado» con quién lo hizo, y publicar otra vez no crea otra', async () => {
    const { token, funnel } = await conFunnel();
    expect(await listHistory(token, funnel.id)).toEqual([]);
    await publishFunnel(token, funnel.id);
    await publishFunnel(token, funnel.id);
    const [version, ...otras] = await listHistory(token, funnel.id);
    expect(otras).toHaveLength(0);
    expect(version).toMatchObject({ funnelId: funnel.id, label: 'Publicado', user: { id: 'demo-ana@correo.com', name: 'Ana', email: 'ana@correo.com' } });
    expect(version!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('despublicar no guarda nada, y volver a publicar guarda otra', async () => {
    const { token, funnel } = await conFunnel();
    await publishFunnel(token, funnel.id);
    await unpublishFunnel(token, funnel.id);
    expect(await listHistory(token, funnel.id)).toHaveLength(1);
    await pausa();
    await publishFunnel(token, funnel.id);
    expect(await listHistory(token, funnel.id)).toHaveLength(2);
  });

  it('un publicar que falla (le falta algo) no guarda ninguna versión', async () => {
    const { token, funnel } = await conFunnel();
    await saveContent(token, funnel.id, []);
    expect((await falla(publishFunnel(token, funnel.id))).status).toBe(422);
    expect(await listHistory(token, funnel.id)).toEqual([]);
  });
});

describe('modo demostración: GET /funnels/:id/history', () => {
  it('lista de la más nueva a la más vieja, sin la copia de la página', async () => {
    const { token, funnel } = await conFunnel();
    for (const nombre of ['Primera', 'Segunda', 'Tercera']) {
      await saveVersion(token, funnel.id, nombre);
      await pausa();
    }
    const versiones = await listHistory(token, funnel.id);
    expect(versiones.map((v) => v.label)).toEqual(['Tercera', 'Segunda', 'Primera']);
    expect(Object.keys(versiones[0]!).sort()).toEqual(['createdAt', 'funnelId', 'id', 'label', 'user']);
  });

  it('con la misma hora, la última que se guardó va primero', async () => {
    const { token, funnel } = await conFunnel();
    await saveVersion(token, funnel.id, 'A');
    await saveVersion(token, funnel.id, 'B');
    editarBaseDeDemostracion((db) => {
      for (const entry of db.history) entry.createdAt = '2026-10-21T10:00:00.000Z';
    });
    expect((await listHistory(token, funnel.id)).map((v) => v.label)).toEqual(['B', 'A']);
  });

  it('solo trae las versiones de ese funnel', async () => {
    const { token, workspace, funnel } = await conFunnel();
    const otro = await seedFunnel(token, workspace, { name: 'Otro' });
    await saveVersion(token, funnel.id, 'De este');
    await saveVersion(token, otro.id, 'Del otro');
    expect((await listHistory(token, funnel.id)).map((v) => v.label)).toEqual(['De este']);
  });

  it('un funnel ajeno o inexistente responde 404 y sin sesión 401', async () => {
    const { funnel } = await conFunnel();
    const ajeno = await startDemo({ email: 'beto@correo.com', name: 'Beto' });
    expect((await falla(listHistory(ajeno.token, funnel.id))).status).toBe(404);
    expect((await falla(listHistory(ajeno.token, 'no-existe'))).status).toBe(404);
    expect((await falla(listHistory('token-falso', funnel.id))).status).toBe(401);
  });
});

describe('modo demostración: POST /funnels/:id/history', () => {
  it('guarda una versión con el nombre sin espacios sobrantes y quién la guardó', async () => {
    const { token, funnel } = await conFunnel();
    const version = await saveVersion(token, funnel.id, '  Antes de cambiar el precio  ');
    expect(version).toMatchObject({ funnelId: funnel.id, label: 'Antes de cambiar el precio', user: { email: 'ana@correo.com' } });
    expect((await listHistory(token, funnel.id))[0]!.id).toBe(version.id);
  });

  it.each([[''], ['   '], [undefined], [null], [42], ['x'.repeat(MAX_LABEL + 1)]])('rechaza el nombre %j', async (nombre) => {
    const { token, funnel } = await conFunnel();
    const error = await falla(saveVersion(token, funnel.id, nombre as never));
    expect(error.status).toBe(422);
    expect(error.fieldErrors()).toHaveProperty('label');
    expect(await listHistory(token, funnel.id)).toEqual([]);
  });

  it('acepta un nombre de exactamente el largo máximo', async () => {
    const { token, funnel } = await conFunnel();
    expect((await saveVersion(token, funnel.id, 'x'.repeat(MAX_LABEL))).label).toHaveLength(MAX_LABEL);
  });

  it('un funnel ajeno responde 404 y no guarda nada', async () => {
    const { token, funnel } = await conFunnel();
    const ajeno = await startDemo({ email: 'beto@correo.com', name: 'Beto' });
    expect((await falla(saveVersion(ajeno.token, funnel.id, 'Colada'))).status).toBe(404);
    expect(await listHistory(token, funnel.id).catch(() => [])).toEqual([]);
  });
});

describe('modo demostración: POST /funnels/:id/history/:historyId/restore', () => {
  it('devuelve el contenido y el diseño a como estaban, y responde el funnel restaurado', async () => {
    const { token, funnel } = await conFunnel();
    const original = titulo(funnel);
    const version = await saveVersion(token, funnel.id, 'Versión buena');
    await saveContent(token, funnel.id, conTitulo(funnel, 'Un título que no me gusta'));
    await saveDesignSpec(token, funnel.id, { ...funnel.designSpec!, template: 'impacto' });
    const restaurado = await restoreVersion(token, funnel.id, version.id);
    expect(titulo(restaurado)).toBe(original);
    expect(restaurado.designSpec?.template).toBe(funnel.designSpec?.template);
    expect(await getFunnel(token, funnel.id)).toEqual(restaurado);
  });

  it('no toca el nombre, el precio, la dirección, el estado ni los ajustes del tipo', async () => {
    const { token, funnel } = await conFunnel();
    const version = await saveVersion(token, funnel.id, 'Versión');
    await updateFunnel(token, funnel.id, { name: 'Nombre nuevo', price: 999, slug: 'direccion-nueva' });
    await publishFunnel(token, funnel.id);
    const restaurado = await restoreVersion(token, funnel.id, version.id);
    expect(restaurado).toMatchObject({ name: 'Nombre nuevo', price: 999, slug: 'direccion-nueva', status: 'published', typeConfig: funnel.typeConfig });
  });

  it('antes de restaurar guarda cómo estaba la página, para poder deshacer', async () => {
    const { token, funnel } = await conFunnel();
    const original = titulo(funnel);
    const buena = await saveVersion(token, funnel.id, 'Versión buena');
    await pausa();
    await saveContent(token, funnel.id, conTitulo(funnel, 'Mi trabajo de hoy'));
    await restoreVersion(token, funnel.id, buena.id);
    const [antes] = await listHistory(token, funnel.id);
    expect(antes!.label).toBe('Antes de restaurar «Versión buena»');
    // Restaurar esa versión deshace la restauración.
    const deshecho = await restoreVersion(token, funnel.id, antes!.id);
    expect(titulo(deshecho)).toBe('Mi trabajo de hoy');
    expect(titulo(deshecho)).not.toBe(original);
  });

  it('una versión sin nombre y un nombre muy largo se escriben bien en la versión de antes', async () => {
    const { token, funnel } = await conFunnel();
    const larga = await saveVersion(token, funnel.id, 'y'.repeat(MAX_LABEL));
    await pausa();
    await restoreVersion(token, funnel.id, larga.id);
    const [conLargo] = await listHistory(token, funnel.id);
    expect(conLargo!.label).toHaveLength(MAX_LABEL);
    expect(conLargo!.label!.startsWith('Antes de restaurar «')).toBe(true);
    editarBaseDeDemostracion((db) => {
      db.history.find((entry: Record<string, any>) => entry.id === larga.id).label = null;
    });
    await pausa();
    await restoreVersion(token, funnel.id, larga.id);
    expect((await listHistory(token, funnel.id))[0]!.label).toBe('Antes de restaurar una versión sin nombre');
  });

  it('las versiones guardadas no cambian aunque después se edite la página', async () => {
    const { token, funnel } = await conFunnel();
    const original = titulo(funnel);
    const buena = await saveVersion(token, funnel.id, 'Buena');
    await saveContent(token, funnel.id, conTitulo(funnel, 'Cambio 1'));
    await restoreVersion(token, funnel.id, buena.id);
    await saveContent(token, funnel.id, conTitulo(funnel, 'Cambio 2'));
    expect(titulo(await restoreVersion(token, funnel.id, buena.id))).toBe(original);
  });

  it('los botones y formularios de la página (CTA) se ajustan a los bloques restaurados', async () => {
    const { token, funnel } = await conFunnel();
    const sinBoton = funnel.content.blocks;
    const conBoton = [...sinBoton, block('boton', 'boton', { label: 'Quiero mi lugar' }, sinBoton.length + 1)];
    await saveContent(token, funnel.id, conBoton);
    const versionConBoton = await saveVersion(token, funnel.id, 'Con botón');
    await saveContent(token, funnel.id, sinBoton);
    const versionSinBoton = await saveVersion(token, funnel.id, 'Sin botón');
    expect((await listCtas(token, funnel.id)).map((c) => c.blockKey)).not.toContain('boton');
    // Restaurar la versión con botón lo vuelve a crear; restaurar la que no lo tiene, lo quita.
    await restoreVersion(token, funnel.id, versionConBoton.id);
    expect((await listCtas(token, funnel.id)).map((c) => c.blockKey)).toContain('boton');
    await restoreVersion(token, funnel.id, versionSinBoton.id);
    expect((await listCtas(token, funnel.id)).map((c) => c.blockKey)).not.toContain('boton');
  });

  it('una versión que no existe o que es de otro funnel responde 404 y no cambia nada', async () => {
    const { token, workspace, funnel } = await conFunnel();
    const otro = await seedFunnel(token, workspace, { name: 'Otro' });
    const ajena = await saveVersion(token, otro.id, 'Del otro');
    const antes = await getFunnel(token, funnel.id);
    for (const id of ['no-existe', ajena.id]) {
      const error = await falla(restoreVersion(token, funnel.id, id));
      expect(error.status, id).toBe(404);
      expect(error.code, id).toBe('HISTORY_NOT_FOUND');
    }
    expect(await getFunnel(token, funnel.id)).toEqual(antes);
    expect(await listHistory(token, funnel.id)).toEqual([]);
  });

  it('un funnel ajeno responde 404 y sin sesión 401', async () => {
    const { token, funnel } = await conFunnel();
    const version = await saveVersion(token, funnel.id, 'Mía');
    const ajeno = await startDemo({ email: 'beto@correo.com', name: 'Beto' });
    expect((await falla(restoreVersion(ajeno.token, funnel.id, version.id))).status).toBe(404);
    expect((await falla(restoreVersion('token-falso', funnel.id, version.id))).status).toBe(401);
  });
});
