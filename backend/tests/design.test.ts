import { describe, expect, it } from 'vitest';
import { BACKGROUNDS, BLOCK_VARIANTS, BODY_FONTS, HEADING_FONTS, cleanProposalDesign, sanitizeBlockStyle, sanitizeFonts, sanitizeLook } from '../src/funnel-types/design.js';

describe('catálogo de diseño', () => {
  it('cada tipo de bloque con variantes tiene al menos dos, sin repetidas', () => {
    for (const [tipo, variantes] of Object.entries(BLOCK_VARIANTS)) {
      expect(variantes?.length, tipo).toBeGreaterThanOrEqual(2);
      expect(new Set(variantes).size, tipo).toBe(variantes?.length);
    }
  });

  it('sanitizeBlockStyle deja solo la variante de su tipo y el fondo del catálogo', () => {
    expect(sanitizeBlockStyle('beneficios', { variant: 'lista', background: 'accent', color: 'red', onClick: 'x' })).toEqual({ variant: 'lista', background: 'accent' });
    expect(sanitizeBlockStyle('beneficios', { variant: 'solido' })).toEqual({});
    expect(sanitizeBlockStyle('boton', { variant: 'banda', background: 'neon' })).toEqual({ variant: 'banda' });
    expect(sanitizeBlockStyle('imagen', { variant: 'x', background: 'dark' })).toEqual({ background: 'dark' });
    expect(sanitizeBlockStyle('texto', undefined)).toEqual({});
    for (const b of BACKGROUNDS) expect(sanitizeBlockStyle('texto', { background: b })).toEqual({ background: b });
  });

  it('sanitizeLook descarta cada campo inválido sin tumbar los demás', () => {
    expect(sanitizeLook({ radius: 'pill', density: 'airy', align: 'center', headingCase: 'upper', headingWeight: 800 })).toEqual({ radius: 'pill', density: 'airy', align: 'center', headingCase: 'upper', headingWeight: 800 });
    expect(sanitizeLook({ radius: 'gigante', density: 'compact', headingWeight: 900 })).toEqual({ density: 'compact' });
    expect(sanitizeLook({ radius: 'x' })).toBeUndefined();
    for (const malo of [null, 'texto', [1], 5, undefined]) expect(sanitizeLook(malo)).toBeUndefined();
  });

  it('sanitizeFonts exige las dos tipografías del catálogo', () => {
    expect(sanitizeFonts({ heading: HEADING_FONTS[0], body: BODY_FONTS[0] })).toEqual({ heading: HEADING_FONTS[0], body: BODY_FONTS[0] });
    expect(sanitizeFonts({ heading: 'Comic Sans MS', body: BODY_FONTS[0] })).toBeUndefined();
    expect(sanitizeFonts({ heading: HEADING_FONTS[0] })).toBeUndefined();
    expect(sanitizeFonts(null)).toBeUndefined();
  });

  it('cleanProposalDesign limpia tipografías y aspecto dentro de la propuesta y no toca lo demás', () => {
    const limpio = cleanProposalDesign({ designSpec: { template: 'impacto', fonts: { heading: 'Raro', body: 'Inter' }, look: { radius: 'sm', density: 'x' } }, blocks: [1] }) as { designSpec: Record<string, unknown>; blocks: number[] };
    expect(limpio.designSpec).toEqual({ template: 'impacto', look: { radius: 'sm' } });
    expect(limpio.blocks).toEqual([1]);
    expect(cleanProposalDesign('texto')).toBe('texto');
    expect(cleanProposalDesign({ blocks: [] })).toEqual({ blocks: [] });
  });
});
