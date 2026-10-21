import { describe, expect, it } from 'vitest';
import { labelProblem, MAX_LABEL } from '@/shared/history';
import { canRestoreHistory } from '@/shared/utils/permissions';
import { fullDate, relativeDate } from '@/shared/utils/dates';

describe('labelProblem', () => {
  it.each([[''], ['   '], ['\n\t'], [undefined], [null], [42], [{}]])('el nombre %j no es válido: hay que ponerle uno', (nombre) => {
    expect(labelProblem(nombre)).toBe('Ponle un nombre a la versión.');
  });

  it('un nombre de más de 120 caracteres (sin contar espacios de los lados) no es válido', () => {
    expect(labelProblem('x'.repeat(MAX_LABEL + 1))).toBe(`El nombre puede tener hasta ${MAX_LABEL} caracteres.`);
    expect(labelProblem(`  ${'x'.repeat(MAX_LABEL + 1)}  `)).toMatch(/hasta 120/);
  });

  it('un nombre normal, y uno justo de 120, sí valen', () => {
    expect(labelProblem('Antes de cambiar el precio')).toBeNull();
    expect(labelProblem('x'.repeat(MAX_LABEL))).toBeNull();
    expect(labelProblem(`  ${'x'.repeat(MAX_LABEL)}  `)).toBeNull();
  });
});

describe('permiso para restaurar versiones', () => {
  it.each([
    ['super_admin', true],
    ['client_admin', true],
    ['marketing_manager', true],
    ['disenador', false],
    ['vendedor', false],
    ['analista', false],
    [undefined, false],
  ])('%s: restaurar=%s', (rol, puede) => {
    expect(canRestoreHistory(rol)).toBe(puede);
  });
});

describe('las fechas compartidas', () => {
  it('se escriben igual que en leads', () => {
    const ahora = Date.now();
    expect(relativeDate(new Date(ahora - 5 * 60_000).toISOString(), ahora)).toBe('hace 5 minutos');
    expect(fullDate('2026-10-21T10:00:00.000Z')).toMatch(/2026/);
  });
});
