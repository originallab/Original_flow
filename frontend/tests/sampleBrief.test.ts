import { describe, expect, it } from 'vitest';
import { TONES } from '@/features/funnels/catalog';
import { randomBrief } from '@/features/funnels/sampleBrief';
import { OBJECTIVES } from '@/services/funnels';

describe('randomBrief (autorrellenar para pruebas)', () => {
  it('llena todas las secciones, con un tono válido', () => {
    const brief = randomBrief('leads');
    for (const key of ['name', 'offer', 'result', 'audience', 'objections', 'cta'] as const) expect(brief[key].trim()).not.toBe('');
    expect(TONES.map((t) => t.id)).toContain(brief.tone);
  });

  it('el precio solo se llena en los funnels de venta', () => {
    expect(randomBrief('venta').price).not.toBe('');
    for (const objective of OBJECTIVES.filter((o) => o !== 'venta')) expect(randomBrief(objective).price).toBe('');
  });

  it('es al azar: con números distintos salen opciones distintas, y siempre en rango', () => {
    expect(randomBrief('venta', () => 0).name).not.toBe(randomBrief('venta', () => 0.999).name);
    expect(() => randomBrief('venta', () => 1)).not.toThrow();
  });
});
