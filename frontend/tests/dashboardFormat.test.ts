import { describe, expect, it } from 'vitest';
import { describeVariation, formatCount, formatMoney, formatPercent, rampStep, sectionLabel, variation } from '@/features/dashboard/format';
import { canViewDashboard } from '@/shared/utils/permissions';

describe('formatCount, formatPercent y formatMoney', () => {
  it('los conteos van completos hasta 9 999 y compactos desde 10 000', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(171)).toBe('171');
    expect(formatCount(1234)).toBe('1234');
    expect(formatCount(9999)).toBe('9999');
    expect(formatCount(10_000)).toMatch(/^10\s?mil$/);
    expect(formatCount(12_345)).toMatch(/^12,3\smil$/);
    expect(formatCount(2_500_000)).toMatch(/M$/);
  });

  it('los porcentajes llevan hasta un decimal y coma decimal', () => {
    expect(formatPercent(0)).toBe('0 %');
    expect(formatPercent(9.4)).toBe('9,4 %');
    expect(formatPercent(100)).toBe('100 %');
    expect(formatPercent(33.333)).toBe('33,3 %');
  });

  it('el dinero lleva su divisa', () => {
    expect(formatMoney({ currency: 'MXN', value: 1500.5 })).toMatch(/1500,50/);
    expect(formatMoney({ currency: 'USD', value: 20 })).toMatch(/US\$|USD/);
    expect(formatMoney({ currency: 'CLP', value: 1000 })).toMatch(/1000|1\.000/);
  });
});

describe('variation', () => {
  it('en porcentaje: sube, baja, igual, nuevo (desde cero) y nada (cero contra cero)', () => {
    expect(variation(10, 5)).toEqual({ kind: 'up', amount: 100 });
    expect(variation(3, 4)).toEqual({ kind: 'down', amount: -25 });
    expect(variation(171, 168)).toEqual({ kind: 'up', amount: 1.8 });
    expect(variation(5, 5)).toEqual({ kind: 'flat', amount: 0 });
    expect(variation(7, 0)).toEqual({ kind: 'new', amount: 0 });
    expect(variation(0, 0)).toEqual({ kind: 'none', amount: 0 });
    expect(variation(0, 4)).toEqual({ kind: 'down', amount: -100 });
  });

  it('en puntos (para valores que ya son porcentajes): se resta, no se divide', () => {
    expect(variation(9.4, 7.1, 'points')).toEqual({ kind: 'up', amount: 2.3 });
    expect(variation(2, 5.5, 'points')).toEqual({ kind: 'down', amount: -3.5 });
    expect(variation(4, 4, 'points')).toEqual({ kind: 'flat', amount: 0 });
    expect(variation(3, 0, 'points')).toEqual({ kind: 'up', amount: 3 }); // en puntos, desde cero sí se puede restar
    expect(variation(0, 0, 'points')).toEqual({ kind: 'none', amount: 0 });
  });

  it('una diferencia que se redondea a cero cuenta como «sin cambios»', () => {
    expect(variation(1000, 1000.01)).toEqual({ kind: 'flat', amount: 0 });
    expect(variation(5.01, 5, 'points')).toEqual({ kind: 'flat', amount: 0 });
  });
});

describe('describeVariation', () => {
  it('escribe el signo, la cifra y la unidad', () => {
    expect(describeVariation({ kind: 'up', amount: 100 })).toBe('+100 %');
    expect(describeVariation({ kind: 'down', amount: -12.5 })).toBe('−12,5 %');
    expect(describeVariation({ kind: 'up', amount: 2.3 }, 'points')).toBe('+2,3 pts');
    expect(describeVariation({ kind: 'down', amount: -3.5 }, 'points')).toBe('−3,5 pts');
    expect(describeVariation({ kind: 'flat', amount: 0 })).toBe('Sin cambios');
    expect(describeVariation({ kind: 'new', amount: 0 })).toBe('Nuevo');
    expect(describeVariation({ kind: 'none', amount: 0 })).toBe('—');
  });
});

describe('sectionLabel y rampStep', () => {
  it('la clave de una sección se lee como nombre', () => {
    expect(sectionLabel('encabezado')).toBe('Encabezado');
    expect(sectionLabel('testimonios-2')).toBe('Testimonios 2');
    expect(sectionLabel('boton_final')).toBe('Boton final');
    expect(sectionLabel('  faq  ')).toBe('Faq');
    expect(sectionLabel('')).toBe('');
  });

  it('reparte los pasos de la rampa de la etapa más clara a la más intensa', () => {
    expect([0, 1, 2, 3].map((i) => rampStep(i, 4))).toEqual([1, 3, 4, 6]);
    expect([0, 1, 2, 3, 4, 5].map((i) => rampStep(i, 6))).toEqual([1, 2, 3, 4, 5, 6]);
    expect([0, 1].map((i) => rampStep(i, 2))).toEqual([1, 6]);
    expect(rampStep(0, 1)).toBe(1);
  });
});

describe('permiso para ver el dashboard', () => {
  it.each([
    ['super_admin', true],
    ['client_admin', true],
    ['marketing_manager', true],
    ['vendedor', true],
    ['analista', true],
    ['disenador', false],
    [undefined, false],
  ])('%s: ver=%s', (rol, ver) => {
    expect(canViewDashboard(rol)).toBe(ver);
  });
});
