import { describe, expect, it } from 'vitest';
import type { FieldDef } from '@/shared/blocks/catalog';
import { validateFields } from '@/shared/blocks/validate';
import { cloneJson, deepEqual, isoToLocalInput, localInputToIso, moveItem, removeAt, replaceAt, withKey } from '@/features/editor/fieldHelpers';

describe('fechas del editor', () => {
  it('de ISO a lo que entiende un campo de fecha y hora, y de vuelta, sin perder el minuto', () => {
    const local = isoToLocalInput('2030-01-15T10:30:00.000Z');
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(localInputToIso(local)).toBe(new Date(local).toISOString());
    const original = new Date('2030-01-15T10:30:00.000Z');
    expect(new Date(localInputToIso(local)!).getTime()).toBe(original.getTime());
  });

  it.each([undefined, null, 5, '', 'mañana', {}])('isoToLocalInput(%j) devuelve vacío', (valor) => {
    expect(isoToLocalInput(valor)).toBe('');
  });

  it.each(['', '   ', 'no es fecha', '2030-99-99T00:00'])('localInputToIso(%j) devuelve undefined', (valor) => {
    expect(localInputToIso(valor)).toBeUndefined();
  });
});

describe('edición de objetos y listas', () => {
  it('withKey cambia una clave sin tocar el original, y con undefined la quita', () => {
    const original = { a: 1, b: 2 };
    expect(withKey(original, 'a', 9)).toEqual({ a: 9, b: 2 });
    expect(withKey(original, 'b', undefined)).toEqual({ a: 1 });
    expect(Object.keys(withKey(original, 'b', undefined))).not.toContain('b');
    expect(original).toEqual({ a: 1, b: 2 });
  });

  it('replaceAt y removeAt devuelven copias', () => {
    const lista = ['a', 'b', 'c'];
    expect(replaceAt(lista, 1, 'X')).toEqual(['a', 'X', 'c']);
    expect(removeAt(lista, 0)).toEqual(['b', 'c']);
    expect(lista).toEqual(['a', 'b', 'c']);
  });

  it('moveItem mueve hacia arriba o abajo y no se sale de los límites', () => {
    const lista = ['a', 'b', 'c'];
    expect(moveItem(lista, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(lista, 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(lista, 0, -1)).toBe(lista);
    expect(moveItem(lista, 2, 1)).toBe(lista);
    expect(lista).toEqual(['a', 'b', 'c']);
  });

  it('deepEqual compara el contenido sin importar el orden de las claves', () => {
    expect(deepEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(null, { a: 1 })).toBe(false);
  });

  it('cloneJson hace una copia profunda', () => {
    const original = { a: { b: [1, 2] } };
    const copia = cloneJson(original);
    copia.a.b.push(3);
    expect(original.a.b).toEqual([1, 2]);
  });
});

describe('campos nuevos del catálogo', () => {
  const texto = (extra: Partial<Extract<FieldDef, { kind: 'text' }>>): FieldDef[] => [{ kind: 'text', key: 't', label: 'T', max: 10, ...extra }];

  it('un texto puede tener un largo mínimo', () => {
    expect(validateFields(texto({ min: 3 }), { t: 'ab' }).map((i) => i.message)).toEqual(['Mínimo 3 caracteres.']);
    expect(validateFields(texto({ min: 3 }), { t: 'abc' })).toEqual([]);
    expect(validateFields(texto({ min: 3 }), { t: '  ab  ' }).map((i) => i.message)).toEqual(['Mínimo 3 caracteres.']);
  });

  it('un grupo opcional puede faltar; uno obligatorio valida a sus hijos aunque falte', () => {
    const grupo = (required: boolean): FieldDef[] => [{ kind: 'group', key: 'g', label: 'G', required, fields: [{ kind: 'text', key: 'x', label: 'X', max: 5, required: true }] }];
    expect(validateFields(grupo(false), {})).toEqual([]);
    expect(validateFields(grupo(false), { g: {} }).map((i) => i.path.join('.'))).toEqual(['g.x']);
    expect(validateFields(grupo(true), {}).map((i) => i.path.join('.'))).toEqual(['g.x']);
    expect(validateFields(grupo(true), { g: 'texto' }).map((i) => i.path.join('.'))).toEqual(['g']);
    expect(validateFields(grupo(true), { g: { x: 'ok' } })).toEqual([]);
  });

  it('un número entero con rango rechaza decimales, el texto y lo que queda fuera', () => {
    const campos: FieldDef[] = [{ kind: 'number', key: 'n', label: 'N', min: 5, max: 480, integer: true, required: true }];
    for (const mala of [4, 481, 30.5, '30', Number.NaN]) expect(validateFields(campos, { n: mala }).map((i) => i.message), String(mala)).toEqual(['Debe ser un número entero, entre 5 y 480.']);
    for (const buena of [5, 480, 100]) expect(validateFields(campos, { n: buena })).toEqual([]);
    expect(validateFields(campos, {}).map((i) => i.message)).toEqual(['Este campo es obligatorio.']);
  });
});
