import { describe, expect, it } from 'vitest';
import { BLOCK_VARIANTS } from '../src/funnel-types/design.js';
import { bucketOf, noveltyHero, noveltyLook, noveltyPalette, noveltyStructure, noveltyVariants, pastPageOf, rotateChoice, type PastPage } from '../src/funnel-types/novelty.js';
import { contrast, paletteReads } from '../src/funnel-types/polish.js';

const CREMA = { primary: '#C65A2E', secondary: '#5A3A2E', accent: '#D9A441', background: '#F7F1E8', text: '#2B2420' };
const bloque = (type: string, style: Record<string, unknown> = {}, order = 0) => ({ key: `${type}-${order}`, type: type as never, order, content: {}, style });
const pagina = (over: Partial<PastPage> = {}): PastPage => ({ blocks: [], ...over });

describe('elección rotativa', () => {
  const opciones = ['a', 'b', 'c', 'd'] as const;

  it('respeta lo elegido si no se repite', () => {
    expect(rotateChoice('a', opciones, ['b', 'c', 'd'], 's', 'x')).toBe('a');
    expect(rotateChoice('a', opciones, [], 's', 'x')).toBe('a');
    expect(rotateChoice(undefined, opciones, [], 's', 'x')).toBeUndefined();
  });

  it('cambia lo que es igual a lo de la página anterior, o lo que está en la mitad de las últimas', () => {
    expect(rotateChoice('a', opciones, ['a', 'b', 'c'], 's', 'x')).not.toBe('a');
    expect(rotateChoice('a', opciones, ['b', 'a', 'c', 'a'], 's', 'x')).not.toBe('a');
    expect(rotateChoice('a', opciones, ['b', 'c', 'a', 'd'], 's', 'x')).toBe('a');
  });

  it('elige la opción menos usada y es estable para una semilla', () => {
    for (let i = 0; i < 20; i += 1) expect(['c', 'd']).toContain(rotateChoice('a', opciones, ['a', 'b', 'b', 'a', 'b'], `s${i}`, 'x'));
    expect(rotateChoice('a', opciones, ['a', 'b'], 'fija', 'x')).toBe(rotateChoice('a', opciones, ['a', 'b'], 'fija', 'x'));
    expect(rotateChoice('a', ['a'] as const, ['a'], 's', 'x')).toBe('a');
  });
});

describe('aspecto', () => {
  it('cambia las tarjetas, el fondo, el corte, el efecto y los botones que repiten los de la página anterior', () => {
    const anterior = pagina({ look: { surface: 'elevated', backdrop: 'gradient', divider: 'slant', effect: 'underline', button: 'solid', align: 'left' } });
    const salida = noveltyLook({ surface: 'elevated', backdrop: 'gradient', divider: 'slant', effect: 'underline', button: 'solid', align: 'left', radius: 'sm' }, [anterior], 's');
    expect(salida.surface).not.toBe('elevated');
    expect(salida.backdrop).not.toBe('gradient');
    expect(salida.divider).not.toBe('slant');
    expect(salida.effect).not.toBe('underline');
    expect(salida.button).not.toBe('solid');
    expect(salida.align).toBe('center');
    expect(salida.radius).toBe('sm');
  });

  it('sin páginas anteriores no cambia nada', () => {
    const look = { surface: 'elevated', backdrop: 'gradient', divider: 'slant', effect: 'underline', button: 'solid', align: 'left' } as const;
    expect(noveltyLook(look, [], 's')).toEqual(look);
  });
});

describe('combinación del aspecto', () => {
  it('la combinación de tarjetas, fondo y corte nunca repite la de las últimas páginas', () => {
    const look = { surface: 'elevated', backdrop: 'gradient', divider: 'slant' } as const;
    const past: PastPage[] = [];
    const claves: string[] = [];
    for (let i = 0; i < 24; i += 1) {
      const salida = noveltyLook(look, past, `s${i}`);
      const clave = `${salida.surface}/${salida.backdrop}/${salida.divider}`;
      // contra las últimas 8 (la ventana que mira el servidor), nunca se repite
      expect(claves.slice(-8).includes(clave), `repetida en ${i}`).toBe(false);
      claves.push(clave);
      past.unshift(pagina({ look: salida }));
    }
  });
});

describe('color', () => {
  it('clasifica el fondo: oscuro, crema, neutro o con tinte', () => {
    expect(bucketOf({ ...CREMA, background: '#0B0B0F' })).toBe('dark');
    expect(bucketOf(CREMA)).toBe('cream');
    expect(bucketOf({ ...CREMA, background: '#FFFFFF' })).toBe('neutral');
    expect(bucketOf({ ...CREMA, background: '#F8FAFC' })).toBe('neutral');
    expect(bucketOf({ ...CREMA, background: '#EEF6F4' })).toBe('tinted');
  });

  it('sin páginas anteriores la paleta no cambia', () => {
    expect(noveltyPalette(CREMA, [], 's')).toBe(CREMA);
    expect(noveltyPalette(CREMA, [pagina({ blocks: [] })], 's')).toBe(CREMA);
  });

  it('si el fondo es de la misma familia que el de las últimas páginas (crema otra vez), cambia de familia', () => {
    const crema = pagina({ palette: { ...CREMA, primary: '#2563EB' } });
    for (let i = 0; i < 15; i += 1) {
      const salida = noveltyPalette({ ...CREMA, primary: '#0F766E' }, [crema, crema, crema], `s${i}`);
      expect(bucketOf(salida), `s${i}`).not.toBe('cream');
      expect(paletteReads(salida), `lee s${i}`).toBe(true);
    }
  });

  it('si el color de marca cae en el mismo matiz que el de una página anterior, gira el matiz de toda la paleta', () => {
    const anterior = pagina({ palette: { ...CREMA, primary: '#C65A2E', background: '#FFFFFF' } });
    for (let i = 0; i < 15; i += 1) {
      const salida = noveltyPalette({ ...CREMA, primary: '#C95B30', background: '#FFFFFF' }, [anterior], `s${i}`);
      expect(salida.primary, `s${i}`).not.toBe('#C95B30');
      expect(paletteReads(salida)).toBe(true);
    }
  });

  it('un fondo oscuro nuevo sigue leyéndose bien (texto claro, marca clara)', () => {
    // la marca no cae en el mismo matiz que la anterior: solo se activa el cambio de familia del fondo
    const crema = pagina({ palette: { ...CREMA, primary: '#2563EB' } });
    let oscuros = 0;
    for (let i = 0; i < 60; i += 1) {
      const salida = noveltyPalette(CREMA, [crema, crema, crema], `d${i}`);
      if (bucketOf(salida) === 'dark') {
        oscuros += 1;
        expect(contrast(salida.text, salida.background)).toBeGreaterThanOrEqual(7);
        expect(contrast(salida.primary, salida.background)).toBeGreaterThanOrEqual(3);
      }
    }
    expect(oscuros).toBeGreaterThan(0);
  });

  it('una paleta distinta a las anteriores se deja como está', () => {
    const azul = pagina({ palette: { ...CREMA, primary: '#2563EB', background: '#FFFFFF' } });
    const verde = { ...CREMA, primary: '#15803D', background: '#EEF6F4' };
    expect(noveltyPalette(verde, [azul], 's').primary).toBe('#15803D');
  });
});

describe('encabezado, formas y estructura', () => {
  const heroDe = (variant: string, background: string) => pagina({ blocks: [{ type: 'encabezado', style: { variant, background } }] });

  it('cambia la forma y el fondo del encabezado si repiten los de la página anterior, y siempre queda con color', () => {
    for (let i = 0; i < 20; i += 1) {
      const salida = noveltyHero({ variant: 'grande', background: 'gradient' }, [heroDe('grande', 'gradient')], `s${i}`);
      expect(salida.variant, `s${i}`).not.toBe('grande');
      expect(salida.background, `s${i}`).not.toBe('gradient');
      expect(['accent', 'dark', 'mesh']).toContain(salida.background);
      expect(BLOCK_VARIANTS.encabezado).toContain(salida.variant);
    }
    expect(noveltyHero({ variant: 'centrado', background: 'dark' }, [heroDe('grande', 'gradient')], 's')).toEqual({ variant: 'centrado', background: 'dark' });
  });

  it('cambia la forma de beneficios, preguntas y precios que repiten las de las últimas páginas', () => {
    const anterior = pagina({ blocks: [{ type: 'beneficios', style: { variant: 'tarjetas' } }, { type: 'faq', style: { variant: 'abierto' } }] });
    const salida = noveltyVariants([bloque('beneficios', { variant: 'tarjetas' }, 1), bloque('faq', { variant: 'abierto' }, 2), bloque('texto', {}, 3)], [anterior], 's');
    expect(salida[0]?.style.variant).not.toBe('tarjetas');
    expect(salida[1]?.style.variant).not.toBe('abierto');
    expect(salida[2]?.style).toEqual({});
  });

  it('reordena los bloques de en medio si el principio repite el de una página reciente, sin mover el encabezado ni el cierre', () => {
    const anterior = pagina({ blocks: ['encabezado', 'beneficios', 'texto', 'faq', 'formulario'].map((type) => ({ type: type as never, style: {} })) });
    const blocks = ['encabezado', 'beneficios', 'texto', 'faq', 'precios', 'formulario'].map((t, i) => bloque(t, {}, i + 1));
    for (let i = 0; i < 15; i += 1) {
      const salida = noveltyStructure(blocks, [anterior], `s${i}`);
      const tipos = salida.map((b) => b.type);
      expect(tipos[0], `s${i}`).toBe('encabezado');
      expect(tipos.at(-1)).toBe('formulario');
      expect(tipos.slice(0, 3).join('>')).not.toBe('encabezado>beneficios>texto');
      expect([...tipos].sort()).toEqual(['beneficios', 'encabezado', 'faq', 'formulario', 'precios', 'texto']);
      expect(salida.map((b) => b.order)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('si el principio ya es distinto, o la página es corta, no reordena', () => {
    const anterior = pagina({ blocks: ['encabezado', 'faq', 'boton'].map((type) => ({ type: type as never, style: {} })) });
    const blocks = ['encabezado', 'beneficios', 'texto', 'boton'].map((t, i) => bloque(t, {}, i + 1));
    expect(noveltyStructure(blocks, [anterior], 's').map((b) => b.type)).toEqual(['encabezado', 'beneficios', 'texto', 'boton']);
    const corta = ['encabezado', 'boton'].map((t, i) => bloque(t, {}, i + 1));
    expect(noveltyStructure(corta, [pagina({ blocks: [{ type: 'encabezado', style: {} }, { type: 'boton', style: {} }] })], 's')).toHaveLength(2);
  });
});

describe('lectura de páginas anteriores', () => {
  it('lee de forma defensiva el diseño y los bloques guardados', () => {
    const p = pastPageOf({ palette: CREMA, look: { surface: 'glow' } }, { blocks: [{ type: 'encabezado', style: { variant: 'grande' } }, { type: 5 }, null] });
    expect(p.palette?.primary).toBe(CREMA.primary);
    expect(p.look?.surface).toBe('glow');
    expect(p.blocks).toEqual([{ type: 'encabezado', style: { variant: 'grande' } }]);
    expect(pastPageOf(null, null)).toEqual({ palette: undefined, look: {}, blocks: [] });
    expect(pastPageOf('x', { blocks: 'no' }).blocks).toEqual([]);
  });
});
