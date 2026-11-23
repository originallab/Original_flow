import { describe, expect, it } from 'vitest';
import { BACKGROUNDS, BLOCK_VARIANTS, BODY_FONTS, HEADING_FONTS, sanitizeLook } from '../src/funnel-types/design.js';
import { chooseDirection, DIRECTIONS, directionOfDesign, hasWord, hash } from '../src/funnel-types/directions.js';
import { contrast, paletteReads, pickPalette, polishBlocks } from '../src/funnel-types/polish.js';
import { TEMPLATES } from '../src/funnel-types/templates.js';
import { generatePageMessages } from '../src/integrations/ai-engine/prompts.js';

const normalizado = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const elegir = (text: string, seed = 'a', objective: 'leads' | 'venta' | 'citas' | 'magnet' | 'webinar' = 'leads', used: { heading?: unknown; body?: unknown }[] = []) =>
  chooseDirection({ objective, text, seed, used });

describe('catálogo de direcciones de diseño', () => {
  it('cada dirección usa solo opciones del catálogo y colores que se leen', () => {
    for (const d of DIRECTIONS) {
      expect(HEADING_FONTS, d.id).toContain(d.fonts.heading);
      expect(BODY_FONTS, d.id).toContain(d.fonts.body);
      expect(TEMPLATES, d.id).toContain(d.template);
      expect(sanitizeLook(d.look), d.id).toEqual(d.look);
      expect(paletteReads(d.palette), `${d.id}: la paleta no se lee`).toBe(true);
      expect(contrast(d.palette.text, d.palette.background), d.id).toBeGreaterThanOrEqual(7);
      expect(d.bands.every((b) => BACKGROUNDS.includes(b)), d.id).toBe(true);
      expect(BACKGROUNDS).toContain(d.hero.background);
      for (const [tipo, variante] of Object.entries(d.variants)) expect(BLOCK_VARIANTS[tipo as keyof typeof BLOCK_VARIANTS], `${d.id}.${tipo}`).toContain(variante);
      expect(BLOCK_VARIANTS.encabezado).toContain(d.hero.variant);
    }
  });

  it('hay variedad: ids únicos, parejas de tipografías casi únicas y plantillas y aspectos distintos', () => {
    expect(new Set(DIRECTIONS.map((d) => d.id)).size).toBe(DIRECTIONS.length);
    const parejas = new Set(DIRECTIONS.map((d) => `${d.fonts.heading}|${d.fonts.body}`));
    expect(parejas.size).toBeGreaterThanOrEqual(DIRECTIONS.length - 3);
    expect(new Set(DIRECTIONS.map((d) => d.template)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(DIRECTIONS.map((d) => d.look.radius)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(DIRECTIONS.map((d) => d.palette.primary)).size).toBe(DIRECTIONS.length);
  });
});

describe('elegir la dirección', () => {
  it('encaja con el rubro de lo que escribió la persona', () => {
    expect(elegir('Clínica de psicología y terapia para parejas').id).toBe('bienestar-sereno');
    expect(elegir('Software de facturación, una plataforma SaaS').id).toBe('tecnologia-limpia');
    expect(elegir('Restaurante de cocina mexicana y catering').id).toBe('gastronomia-calida');
    expect(elegir('Despacho de abogados y asesoría fiscal').id).toBe('profesional-sobrio');
    expect(elegir('Gimnasio de crossfit y entrenamiento').id).toBe('energia-fitness');
  });

  it('entiende acentos, mayúsculas y plurales', () => {
    expect(elegir('PSICOLOGÍA y TERAPIAS').id).toBe('bienestar-sereno');
    expect(['creativo-vibrante', 'editorial-calido']).toContain(elegir('Cursos de diseño gráfico').id);
  });

  it('una palabra solo cuenta completa: «ong» no está en «tengo» ni en «pongo»', () => {
    expect(hasWord('tengo y pongo', 'ong')).toBe(false);
    expect(hasWord('somos una ong local', 'ong')).toBe(true);
    expect(hasWord('muchas terapias', 'terapia')).toBe(true);
    expect(hasWord('bienes raices en venta', 'bienes raices')).toBe(true);
    expect(hasWord('diseno', normalizado('Diseño'))).toBe(true);
  });

  it('con la misma semilla da lo mismo y con otras semillas, sin rubro claro, reparte entre varias', () => {
    expect(elegir('negocio', 'semilla-1').id).toBe(elegir('negocio', 'semilla-1').id);
    const ids = new Set(Array.from({ length: 60 }, (_, i) => elegir('un negocio cualquiera', `s${i}`).id));
    expect(ids.size).toBeGreaterThanOrEqual(5);
  });

  it('el objetivo inclina la elección cuando no hay rubro', () => {
    const ids = new Set(Array.from({ length: 30 }, (_, i) => elegir('', `s${i}`, 'webinar').id));
    expect(ids.has('eventos-festivo')).toBe(true);
  });

  it('evita las tipografías que ya usan otras páginas del mismo negocio', () => {
    const usadas: { heading: string; body: string }[] = [];
    const ids: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const d = elegir('clínica de terapia y psicología', `seed-${i}`, 'citas', usadas);
      usadas.push(d.fonts);
      ids.push(d.id);
    }
    expect(new Set(ids).size).toBe(8);
  });

  it('si ya se usaron todas, igual devuelve una dirección', () => {
    const todas = DIRECTIONS.map((d) => d.fonts);
    expect(elegir('terapia', 'x', 'citas', todas).id).toBeTruthy();
  });

  it('reconoce la dirección de un diseño ya guardado por sus tipografías', () => {
    const d = DIRECTIONS[0]!;
    expect(directionOfDesign({ template: 'x', fonts: d.fonts })?.id).toBe(d.id);
    expect(directionOfDesign({ template: 'claridad' })).toBeNull();
    expect(directionOfDesign(null)).toBeNull();
    expect(directionOfDesign({ fonts: { heading: 'Otra', body: 'Otra' } })).toBeNull();
  });

  it('el hash es estable y reparte', () => {
    expect(hash('abc')).toBe(hash('abc'));
    expect(hash('abc')).not.toBe(hash('abd'));
  });
});

describe('paleta', () => {
  const direccion = DIRECTIONS[0]!;
  const buena = { primary: '#0E7A63', secondary: '#1B4D3E', accent: '#F4A261', background: '#FFFFFF', text: '#1A1A1A' };
  const mala = { primary: '#FEFEFE', secondary: '#EEEEEE', accent: '#FAFAFA', background: '#FFFFFF', text: '#F5F5F5' };

  it('la de la marca manda aunque se lea mal; si no, la de la IA si se lee; si no, la de la dirección', () => {
    expect(pickPalette(direccion, mala, buena)).toBe(mala);
    expect(pickPalette(direccion, undefined, buena)).toBe(buena);
    expect(pickPalette(direccion, undefined, mala)).toBe(direccion.palette);
    expect(pickPalette(direccion, undefined, undefined)).toBe(direccion.palette);
  });

  it('el contraste se calcula como WCAG', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('pasada de calidad de los bloques', () => {
  const dir = DIRECTIONS.find((d) => d.id === 'tecnologia-limpia')!;
  const bloque = (key: string, type: string, style: Record<string, unknown> = {}, order = 0) => ({ key, type: type as never, order, content: {}, style });

  it('completa forma y fondo de lo que la IA no eligió, con la dirección', () => {
    const [hero, beneficios] = polishBlocks([bloque('h', 'encabezado', {}, 1), bloque('b', 'beneficios', {}, 2)], dir);
    expect(hero?.style).toEqual({ variant: dir.hero.variant, background: dir.hero.background });
    expect(beneficios?.style.variant).toBe(dir.variants.beneficios);
    expect(BACKGROUNDS).toContain(beneficios?.style.background);
  });

  it('respeta lo que la IA eligió bien', () => {
    const [hero] = polishBlocks([bloque('h', 'encabezado', { variant: 'grande', background: 'accent' }, 1)], dir);
    expect(hero?.style).toEqual({ variant: 'grande', background: 'accent' });
  });

  it('nunca deja dos franjas fuertes seguidas ni más de una de cada tres', () => {
    const muchos = Array.from({ length: 9 }, (_, i) => bloque(`t${i}`, 'texto', { background: i % 2 === 0 ? 'dark' : 'accent' }, i + 1));
    const salida = polishBlocks(muchos, dir);
    const fuertes = salida.map((b) => b.style.background === 'dark' || b.style.background === 'accent');
    fuertes.forEach((f, i) => expect(f && fuertes[i - 1]).toBeFalsy());
    expect(fuertes.filter(Boolean).length).toBeLessThanOrEqual(3);
  });

  it('los bloques del mismo tipo no se dibujan todos igual y solo hay un texto destacado', () => {
    const salida = polishBlocks([bloque('a', 'beneficios', { variant: 'lista' }, 1), bloque('b', 'beneficios', { variant: 'lista' }, 2), bloque('c', 'texto', { variant: 'destacado' }, 3), bloque('d', 'texto', { variant: 'destacado' }, 4)], dir);
    expect(salida[0]?.style.variant).not.toBe(salida[1]?.style.variant);
    expect(salida.filter((b) => b.type === 'texto' && b.style.variant === 'destacado')).toHaveLength(1);
  });

  it('las imágenes y los botones no llevan fondo, y el botón en banda no se pega a una franja de color', () => {
    const salida = polishBlocks([bloque('i', 'imagen', { background: 'dark' }, 1), bloque('t', 'texto', { background: 'accent' }, 2), bloque('c', 'boton', { variant: 'banda', background: 'dark' }, 3)], dir);
    expect(salida[0]?.style.background).toBeUndefined();
    expect(salida[2]?.style.background).toBeUndefined();
    expect(salida[2]?.style.variant).toBe('solido');
  });

  it('renumera el orden y descarta estilos que no son del catálogo', () => {
    const salida = polishBlocks([bloque('b', 'texto', { color: 'red', variant: 'x' }, 9), bloque('a', 'encabezado', {}, 3)], dir);
    expect(salida.map((b) => [b.key, b.order])).toEqual([['a', 1], ['b', 2]]);
    expect(Object.keys(salida[1]!.style).every((k) => k === 'variant' || k === 'background')).toBe(true);
  });

  it('una página sin encabezado también se arma', () => {
    expect(polishBlocks([bloque('t', 'texto', {}, 1)], dir)).toHaveLength(1);
    expect(polishBlocks([], dir)).toEqual([]);
  });
});

describe('instrucciones a la IA con la dirección asignada', () => {
  it('le dicen la dirección, que no cambie el diseño y las preferencias de estilo', () => {
    const d = DIRECTIONS.find((x) => x.id === 'lujo-sobrio')!;
    const sistema = generatePageMessages({ objective: 'venta', language: 'es', name: 'Joyas', blockTypes: ['encabezado'], baseBlocks: ['encabezado'], direction: d })[0]!.content;
    expect(sistema).toContain('lujo-sobrio');
    expect(sistema).toContain(d.mood);
    expect(sistema).toContain('"Playfair Display"');
    expect(sistema).toContain('no lo cambies');
    expect(sistema).not.toContain('Combina con intención');
  });
});
