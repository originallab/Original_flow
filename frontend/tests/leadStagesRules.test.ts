import { describe, expect, it } from 'vitest';
import { insertionIndex, MAX_STAGE_NAME, stageNameProblem, withPlaced } from '@/shared/leadStages';

describe('el nombre de una etapa', () => {
  it('de 1 a 60 caracteres, sin contar los espacios de los extremos', () => {
    expect(stageNameProblem('Propuesta enviada')).toBeNull();
    expect(stageNameProblem('  Propuesta  ')).toBeNull();
    expect(stageNameProblem('a'.repeat(MAX_STAGE_NAME))).toBeNull();
    // El largo cuenta sin los espacios de los extremos: 60 letras con espacios alrededor sigue siendo válido.
    expect(stageNameProblem(`  ${'a'.repeat(MAX_STAGE_NAME)}  `)).toBeNull();
    expect(stageNameProblem('a'.repeat(MAX_STAGE_NAME + 1))).toMatch(/hasta 60/);
    expect(stageNameProblem('')).toMatch(/nombre/i);
    expect(stageNameProblem('   ')).toMatch(/nombre/i);
    expect(stageNameProblem(undefined)).toMatch(/nombre/i);
    expect(stageNameProblem(7)).toMatch(/nombre/i);
  });
});

describe('dónde cae una etapa', () => {
  const etapas = (...finales: boolean[]) => finales.map((isFinal, index) => ({ id: `e${index + 1}`, isFinal }));

  it('sin posición cae justo antes de la final, o al final si no hay etapa final', () => {
    expect(insertionIndex(etapas(false, false, false, true))).toBe(3);
    expect(insertionIndex(etapas(false, false))).toBe(2);
    expect(insertionIndex([])).toBe(0);
  });

  it('con posición (base 1) cae ahí, pero nunca después de la final ni antes de la primera', () => {
    const otras = etapas(false, false, false, true);
    expect(insertionIndex(otras, 1)).toBe(0);
    expect(insertionIndex(otras, 2)).toBe(1);
    expect(insertionIndex(otras, 4)).toBe(3);
    expect(insertionIndex(otras, 5)).toBe(3);
    expect(insertionIndex(otras, 99)).toBe(3);
    expect(insertionIndex(otras, 0)).toBe(0);
    expect(insertionIndex(otras, -4)).toBe(0);
    expect(insertionIndex(etapas(false, false), 99)).toBe(2);
  });

  it('inserta sin tocar la lista original', () => {
    const original = ['a', 'b', 'c'];
    expect(withPlaced(original, 'x', 1)).toEqual(['a', 'x', 'b', 'c']);
    expect(withPlaced(original, 'x', 3)).toEqual(['a', 'b', 'c', 'x']);
    expect(original).toEqual(['a', 'b', 'c']);
  });
});
