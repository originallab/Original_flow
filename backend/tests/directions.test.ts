import { describe, expect, it } from 'vitest';
import { creativeBrief, describeDesign, qualityExamples } from '../src/funnel-types/creative.js';
import { BACKGROUNDS, BLOCK_VARIANTS, BODY_FONTS, DIVIDERS, HEADING_FONTS, ICONS, SINGLE_WEIGHT_FONTS, cleanIcons, sanitizeBlockStyle, sanitizeLook, fillIcons } from '../src/funnel-types/design.js';
import { DIRECTIONS, hash } from '../src/funnel-types/directions.js';
import { contrast, diversifyHeading, enrichLook, fallbackDesign, guardLook, paletteReads, pickPalette, polishBlocks, randomHints, repairPalette } from '../src/funnel-types/polish.js';
import { TEMPLATES } from '../src/funnel-types/templates.js';
import { generatePageMessages } from '../src/integrations/ai-engine/prompts.js';

describe('diseños de referencia (ejemplos de calidad y respaldo)', () => {
  it('cada uno usa solo opciones del catálogo y colores que se leen', () => {
    for (const d of DIRECTIONS) {
      expect(HEADING_FONTS, d.id).toContain(d.fonts.heading);
      expect(BODY_FONTS, d.id).toContain(d.fonts.body);
      expect(TEMPLATES, d.id).toContain(d.template);
      expect(sanitizeLook(d.look), d.id).toEqual(d.look);
      expect(paletteReads(d.palette), `${d.id}: la paleta no se lee`).toBe(true);
      expect(contrast(d.palette.text, d.palette.background), d.id).toBeGreaterThanOrEqual(7);
      expect(d.bands.every((b) => BACKGROUNDS.includes(b)), d.id).toBe(true);
      for (const [tipo, variante] of Object.entries(d.variants)) expect(BLOCK_VARIANTS[tipo as keyof typeof BLOCK_VARIANTS], `${d.id}.${tipo}`).toContain(variante);
    }
  });

  it('las tipografías de un solo grosor son del catálogo y no hay repetidas', () => {
    expect(new Set(HEADING_FONTS).size).toBe(HEADING_FONTS.length);
    expect(new Set(BODY_FONTS).size).toBe(BODY_FONTS.length);
    for (const f of SINGLE_WEIGHT_FONTS) expect(HEADING_FONTS).toContain(f);
    expect(HEADING_FONTS.length).toBeGreaterThanOrEqual(30);
  });
});

describe('punto de partida creativo', () => {
  it('es estable para una semilla y cambia con otras', () => {
    expect(creativeBrief('a')).toEqual(creativeBrief('a'));
    const distintos = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(creativeBrief(`s${i}`))));
    expect(distintos.size).toBeGreaterThan(25);
    const estructuras = new Set(Array.from({ length: 40 }, (_, i) => creativeBrief(`s${i}`).estructura));
    expect(estructuras.size).toBeGreaterThanOrEqual(6);
  });

  it('da ejemplos de calidad distintos entre sí', () => {
    const ejemplos = qualityExamples('x', 2);
    expect(ejemplos).toHaveLength(2);
    expect(ejemplos[0]?.fonts).not.toEqual(ejemplos[1]?.fonts);
  });

  it('resume el diseño y la estructura de otra página, y ninguno si no tiene diseño', () => {
    const texto = describeDesign({ fonts: { heading: 'Syne' }, palette: { primary: '#112233', background: '#FFFFFF' }, look: { radius: 'pill' } }, { blocks: [{ type: 'encabezado' }, { type: 'faq' }] });
    expect(texto).toBe('títulos Syne, color #112233 sobre #FFFFFF, esquinas pill, bloques encabezado>faq');
    expect(describeDesign(null, null)).toBeNull();
    expect(describeDesign({}, { blocks: [] })).toBeNull();
  });

  it('el hash es estable y reparte', () => {
    expect(hash('abc')).toBe(hash('abc'));
    expect(hash('abc')).not.toBe(hash('abd'));
  });
});

describe('paleta', () => {
  const buena = { primary: '#0E7A63', secondary: '#1B4D3E', accent: '#F4A261', background: '#FFFFFF', text: '#1A1A1A' };
  const mala = { primary: '#FEFEFE', secondary: '#EEEEEE', accent: '#FAFAFA', background: '#FFFFFF', text: '#F5F5F5' };
  const respaldo = DIRECTIONS[0]!.palette;

  it('la de la marca manda aunque se lea mal; si no, la de la IA (corregida si no se lee); si no, la de respaldo', () => {
    expect(pickPalette(respaldo, mala, buena)).toBe(mala);
    expect(pickPalette(respaldo, undefined, buena)).toBe(buena);
    expect(paletteReads(pickPalette(respaldo, undefined, mala))).toBe(true);
    expect(pickPalette(respaldo, undefined, undefined)).toBe(respaldo);
  });

  it('corregir una paleta conserva el fondo y el acento y deja el texto legible', () => {
    const arreglada = repairPalette(mala);
    expect(arreglada.background).toBe('#FFFFFF');
    expect(arreglada.accent).toBe('#FAFAFA');
    expect(contrast(arreglada.text, arreglada.background)).toBeGreaterThanOrEqual(7);
    expect(contrast(arreglada.primary, arreglada.background)).toBeGreaterThanOrEqual(3);
  });

  it('con fondo oscuro, aclara el texto en lugar de oscurecerlo', () => {
    const arreglada = repairPalette({ primary: '#222222', secondary: '#333333', accent: '#444444', background: '#101010', text: '#1A1A1A' });
    expect(contrast(arreglada.text, '#101010')).toBeGreaterThanOrEqual(7);
    expect(arreglada.text).not.toBe('#1A1A1A');
  });

  it('una paleta que ya se lee no cambia y el contraste se calcula como WCAG', () => {
    expect(repairPalette(buena).text).toBe(buena.text);
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('el diseño de respaldo es de un ejemplo del catálogo y varía con la semilla', () => {
    const ids = new Set(Array.from({ length: 30 }, (_, i) => fallbackDesign(`s${i}`).fonts.heading));
    expect(ids.size).toBeGreaterThan(4);
    expect(HEADING_FONTS).toContain(fallbackDesign('x').fonts.heading);
  });
});

describe('recursos visuales por tema', () => {
  const clara = { primary: '#1E3A5F', secondary: '#3A4A5E', accent: '#B8893B', background: '#FFFFFF', text: '#14213D' };
  const oscura = { primary: '#22D3EE', secondary: '#A78BFA', accent: '#F472B6', background: '#0A0A12', text: '#E6E6F0' };

  it('el aspecto acepta superficie, efecto, fondo, corte y botones del catálogo y descarta lo demás', () => {
    expect(sanitizeLook({ surface: 'glow', effect: 'gradient', backdrop: 'grid', divider: 'slant', button: 'glow' })).toEqual({ surface: 'glow', effect: 'gradient', backdrop: 'grid', divider: 'slant', button: 'glow' });
    expect(sanitizeLook({ surface: 'neon', effect: 'rainbow', backdrop: 'x', divider: 'spiral', button: 'laser', radius: 'sm' })).toEqual({ radius: 'sm' });
  });

  it('sobre fondo claro, el brillo de neón en títulos y botones y el vidrio sin nada detrás se suavizan', () => {
    expect(guardLook({ effect: 'glow', button: 'glow', surface: 'glass' }, clara)).toEqual({ effect: 'underline', button: 'gradient', surface: 'elevated' });
    expect(guardLook({ surface: 'glass', backdrop: 'gradient' }, clara)).toEqual({ surface: 'glass', backdrop: 'gradient' });
  });

  it('sobre fondo oscuro, los recursos de neón se conservan, y sin aspecto no hace nada', () => {
    const look = { effect: 'glow', button: 'glow', surface: 'glass', backdrop: 'grid' } as const;
    expect(guardLook(look, oscura)).toEqual(look);
    expect(guardLook(undefined, clara)).toBeUndefined();
  });

  it('las instrucciones traen la guía por tema (profesional, videojuegos, lujo...) y los nuevos recursos', () => {
    const texto = generatePageMessages({ objective: 'venta', language: 'es', name: 'Pixel', blockTypes: ['encabezado'] as never, baseBlocks: ['encabezado'] as never })[0]!.content;
    for (const frase of ['Profesional, corporativo', 'Videojuegos, esports', 'Lujo, joyería', 'Infantil', 'Bienestar', 'Orbitron', '"surface": flat|outline|elevated|glass|glow', '"backdrop": plain|gradient|grid|dots|glow', 'reflejar el TEMA y el TONO']) expect(texto).toContain(frase);
  });
});

describe('que ninguna página quede plana', () => {
  const pistas = randomHints('plana');
  const bloque = (key: string, type: string, style: Record<string, unknown> = {}, order = 0) => ({ key, type: type as never, order, content: {}, style });
  const FUERTES = ['accent', 'dark', 'gradient', 'mesh'];
  const STRONG_BG = FUERTES;

  it('el catálogo tiene fondos de degradado y malla, cortes ondulados y en zigzag y íconos', () => {
    expect(BACKGROUNDS).toEqual(expect.arrayContaining(['gradient', 'mesh']));
    expect(DIVIDERS).toEqual(expect.arrayContaining(['wave', 'zigzag']));
    expect(sanitizeBlockStyle('texto', { background: 'mesh' })).toEqual({ background: 'mesh' });
    expect(ICONS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(ICONS).size).toBe(ICONS.length);
  });

  it('si la IA no puso ninguna franja de color, el encabezado toma una', () => {
    for (let i = 0; i < 20; i += 1) {
      const salida = polishBlocks([bloque('h', 'encabezado', { background: 'base' }, 1), bloque('t', 'texto', { background: 'alt' }, 2), bloque('b', 'beneficios', { background: 'base' }, 3), bloque('c', 'boton', {}, 4)], randomHints(`s${i}`));
      // un botón en banda es una franja de color por sí mismo
      expect(salida.some((b) => FUERTES.includes(b.style.background as string) || b.style.variant === 'banda'), `semilla s${i}`).toBe(true);
    }
  });

  it('si ya hay una franja de color, no agrega otra; un botón en banda también cuenta', () => {
    const una = polishBlocks([bloque('h', 'encabezado', { background: 'mesh' }, 1), bloque('t', 'texto', { background: 'base' }, 2)], pistas);
    expect(una.filter((b) => FUERTES.includes(b.style.background as string))).toHaveLength(1);
    const banda = polishBlocks([bloque('h', 'encabezado', { background: 'base' }, 1), bloque('c', 'boton', { variant: 'banda' }, 2)], pistas);
    // el encabezado nunca queda plano: toma una franja de color aunque la IA le haya puesto «base»
    expect(STRONG_BG).toContain(banda[0]?.style.background);
  });

  it('el degradado y la malla también cuentan como franjas fuertes: no van seguidas', () => {
    const salida = polishBlocks([bloque('a', 'texto', { background: 'gradient' }, 1), bloque('b', 'texto', { background: 'mesh' }, 2), bloque('c', 'texto', { background: 'gradient' }, 3)], pistas);
    const fuertes = salida.map((b) => FUERTES.includes(b.style.background as string));
    fuertes.forEach((f, i) => expect(f && fuertes[i - 1]).toBeFalsy());
  });

  it('el encabezado SIEMPRE lleva una franja de color, y las páginas de 4 bloques o más al menos dos', () => {
    for (let i = 0; i < 40; i += 1) {
      const fondo = ['base', 'alt', undefined][i % 3];
      const salida = polishBlocks(
        [bloque('h', 'encabezado', fondo ? { background: fondo } : {}, 1), bloque('t', 'texto', { background: 'base' }, 2), bloque('b', 'beneficios', { background: 'alt' }, 3), bloque('f', 'faq', { background: 'base' }, 4), bloque('c', 'boton', { variant: 'solido' }, 5)],
        randomHints(`v${i}`),
      );
      expect(FUERTES, `encabezado v${i}`).toContain(salida[0]?.style.background);
      expect(salida.filter((b) => FUERTES.includes(b.style.background as string) || b.style.variant === 'banda').length, `franjas v${i}`).toBeGreaterThanOrEqual(2);
      const fuertes = salida.map((b) => FUERTES.includes(b.style.background as string));
      fuertes.forEach((f, k) => expect(f && fuertes[k - 1], `seguidas v${i}`).toBeFalsy());
    }
  });

  it('las páginas cortas (menos de 4 bloques) solo exigen la franja del encabezado', () => {
    const salida = polishBlocks([bloque('h', 'encabezado', {}, 1), bloque('t', 'texto', {}, 2), bloque('c', 'boton', {}, 3)], randomHints('corta'));
    expect(FUERTES).toContain(salida[0]?.style.background);
  });

  it('el aspecto mínimo de cualquier página: tarjetas con sombra, decoración de fondo y corte que no es recto', () => {
    const clara = { primary: '#1E3A5F', secondary: '#3A4A5E', accent: '#B8893B', background: '#FFFFFF', text: '#14213D' };
    const oscura = { primary: '#22D3EE', secondary: '#A78BFA', accent: '#F472B6', background: '#0A0A12', text: '#E6E6F0' };
    const minimo = enrichLook(undefined, clara, 's');
    expect(minimo).toMatchObject({ surface: 'elevated', backdrop: 'gradient' });
    expect(['slant', 'wave']).toContain(minimo.divider);
    expect(enrichLook({ surface: 'flat', backdrop: 'plain', divider: 'none' }, clara, 's')).toMatchObject({ surface: 'elevated', backdrop: 'gradient' });
    expect(enrichLook({}, oscura, 's').backdrop).toBe('glow');
    const dividers = new Set(Array.from({ length: 30 }, (_, i) => enrichLook({}, clara, `k${i}`).divider));
    expect(dividers).toEqual(new Set(['slant', 'wave']));
  });

  it('lo que la IA eligió por encima del mínimo se respeta', () => {
    const clara = { primary: '#1E3A5F', secondary: '#3A4A5E', accent: '#B8893B', background: '#FFFFFF', text: '#14213D' };
    const look = { surface: 'glass', backdrop: 'grid', divider: 'zigzag', effect: 'underline', radius: 'pill' } as const;
    expect(enrichLook(look, clara, 's')).toEqual(look);
    expect(enrichLook({ surface: 'outline' }, clara, 's').surface).toBe('outline');
  });

  it('a los beneficios sin ícono se les da uno genérico, sin repetir dentro del bloque, y los que ya tienen no cambian', () => {
    const lleno = fillIcons('beneficios', { items: [{ title: 'A', icon: 'rocket' }, { title: 'B' }, { title: 'C' }, { title: 'D' }, 'x'] }, 0) as { items: ({ icon?: string } | string)[] };
    const iconos = lleno.items.filter((i): i is { icon?: string } => typeof i === 'object').map((i) => i.icon);
    expect(iconos[0]).toBe('rocket');
    expect(iconos.every((i) => i && ICONS.includes(i as never))).toBe(true);
    expect(new Set(iconos).size).toBe(iconos.length);
    expect(lleno.items[4]).toBe('x');
    const doce = fillIcons('beneficios', { items: Array.from({ length: 12 }, (_, i) => ({ title: `T${i}` })) }, 3) as { items: { icon: string }[] };
    expect(new Set(doce.items.map((i) => i.icon)).size).toBe(12);
    const otro = { items: [{ title: 'A' }] };
    expect(fillIcons('faq', otro, 0)).toBe(otro);
    expect(fillIcons('beneficios', { title: 'sin items' }, 0)).toEqual({ title: 'sin items' });
  });

  it('los íconos de los beneficios solo valen si son del catálogo; lo demás no se toca', () => {
    const limpio = cleanIcons('beneficios', { title: 'T', items: [{ title: 'A', icon: 'rocket' }, { title: 'B', icon: 'inventado' }, { title: 'C', icon: 5 }, { title: 'D' }, 'x'] });
    expect(limpio).toEqual({ title: 'T', items: [{ title: 'A', icon: 'rocket' }, { title: 'B' }, { title: 'C' }, { title: 'D' }, 'x'] });
    const otro = { items: [{ title: 'A', icon: 'inventado' }] };
    expect(cleanIcons('faq', otro)).toBe(otro);
    expect(cleanIcons('beneficios', { title: 'sin items' })).toEqual({ title: 'sin items' });
  });

  it('las instrucciones piden que la página no sea plana y ofrecen los íconos y los nuevos fondos', () => {
    const texto = generatePageMessages({ objective: 'venta', language: 'es', name: 'X', blockTypes: ['encabezado'] as never, baseBlocks: ['encabezado'] as never })[0]!.content;
    for (const frase of ['NO debe verse plana', '"gradient" un degradado', '"mesh" una malla', 'zigzag', 'rocket', 'gamepad-2', 'ícono']) expect(texto).toContain(frase);
  });
});

describe('tipografías que no se repiten', () => {
  it('si otra página del negocio ya usa la de títulos, se cambia por otra de su misma familia', () => {
    const nueva = diversifyHeading('Cormorant Garamond', ['Cormorant Garamond'], 's1');
    expect(nueva).not.toBe('Cormorant Garamond');
    expect(['Playfair Display', 'Lora', 'Fraunces', 'Libre Baskerville', 'Merriweather', 'Bitter', 'Spectral', 'Crimson Pro', 'Zilla Slab', 'Young Serif', 'Instrument Serif', 'Gloock', 'Prata', 'DM Serif Display', 'Abril Fatface']).toContain(nueva);
    expect(diversifyHeading('Anton', ['Anton'], 's1')).toMatch(/Oswald|Bebas Neue|Archivo Black/);
  });

  it('no cambia nada si no se repite, y si ya se usaron todas las de su familia la deja', () => {
    expect(diversifyHeading('Syne', ['Lora'], 's')).toBe('Syne');
    expect(diversifyHeading('Anton', ['Anton', 'Oswald', 'Bebas Neue', 'Archivo Black'], 's')).toBe('Anton');
    expect(diversifyHeading('Syne', [], 's')).toBe('Syne');
  });
});

describe('pasada de calidad de los bloques', () => {
  const pistas = randomHints('semilla-fija');
  const bloque = (key: string, type: string, style: Record<string, unknown> = {}, order = 0) => ({ key, type: type as never, order, content: {}, style });

  it('las pistas al azar son estables para una semilla, variadas entre semillas y del catálogo', () => {
    expect(randomHints('a')).toEqual(randomHints('a'));
    const huellas = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(randomHints(`s${i}`))));
    expect(huellas.size).toBeGreaterThan(15);
    for (let i = 0; i < 20; i += 1) {
      const h = randomHints(`z${i}`);
      for (const [tipo, variante] of Object.entries(h.variants)) expect(BLOCK_VARIANTS[tipo as keyof typeof BLOCK_VARIANTS]).toContain(variante);
      expect(h.bands.every((b) => BACKGROUNDS.includes(b))).toBe(true);
    }
  });

  it('completa forma y fondo de lo que la IA no eligió', () => {
    const [hero, beneficios] = polishBlocks([bloque('h', 'encabezado', {}, 1), bloque('b', 'beneficios', {}, 2)], pistas);
    expect(hero?.style).toEqual({ variant: pistas.hero.variant, background: pistas.hero.background });
    expect(beneficios?.style.variant).toBe(pistas.variants.beneficios);
    expect(BACKGROUNDS).toContain(beneficios?.style.background);
  });

  it('respeta lo que la IA eligió bien', () => {
    const [hero] = polishBlocks([bloque('h', 'encabezado', { variant: 'grande', background: 'accent' }, 1)], pistas);
    expect(hero?.style).toEqual({ variant: 'grande', background: 'accent' });
  });

  it('nunca deja dos franjas fuertes seguidas ni más de una de cada tres', () => {
    const muchos = Array.from({ length: 9 }, (_, i) => bloque(`t${i}`, 'texto', { background: i % 2 === 0 ? 'dark' : 'accent' }, i + 1));
    const salida = polishBlocks(muchos, pistas);
    const fuertes = salida.map((b) => b.style.background === 'dark' || b.style.background === 'accent');
    fuertes.forEach((f, i) => expect(f && fuertes[i - 1]).toBeFalsy());
    expect(fuertes.filter(Boolean).length).toBeLessThanOrEqual(3);
  });

  it('los bloques del mismo tipo no se dibujan todos igual y solo hay un texto destacado', () => {
    const salida = polishBlocks([bloque('a', 'beneficios', { variant: 'lista' }, 1), bloque('b', 'beneficios', { variant: 'lista' }, 2), bloque('c', 'texto', { variant: 'destacado' }, 3), bloque('d', 'texto', { variant: 'destacado' }, 4)], pistas);
    expect(salida[0]?.style.variant).not.toBe(salida[1]?.style.variant);
    expect(salida.filter((b) => b.type === 'texto' && b.style.variant === 'destacado')).toHaveLength(1);
  });

  it('las imágenes y los botones no llevan fondo, y el botón en banda no se pega a una franja de color', () => {
    const salida = polishBlocks([bloque('i', 'imagen', { background: 'dark' }, 1), bloque('t', 'texto', { background: 'accent' }, 2), bloque('c', 'boton', { variant: 'banda', background: 'dark' }, 3)], pistas);
    expect(salida[0]?.style.background).toBeUndefined();
    expect(salida[2]?.style.background).toBeUndefined();
    expect(salida[2]?.style.variant).toBe('solido');
  });

  it('renumera el orden y descarta estilos que no son del catálogo', () => {
    const salida = polishBlocks([bloque('b', 'texto', { color: 'red', variant: 'x' }, 9), bloque('a', 'encabezado', {}, 3)], pistas);
    expect(salida.map((b) => [b.key, b.order])).toEqual([['a', 1], ['b', 2]]);
    expect(Object.keys(salida[1]!.style).every((k) => k === 'variant' || k === 'background')).toBe(true);
  });

  it('una página sin encabezado también se arma', () => {
    expect(polishBlocks([bloque('t', 'texto', {}, 1)], pistas)).toHaveLength(1);
    expect(polishBlocks([], pistas)).toEqual([]);
  });
});

describe('instrucciones a la IA', () => {
  const base = { objective: 'venta' as const, language: 'es', name: 'Joyas', blockTypes: ['encabezado'] as never, baseBlocks: ['encabezado'] as never };
  const sistema = (extra: object = {}) => generatePageMessages({ ...base, ...extra })[0]!.content;

  it('la IA diseña desde cero: catálogo completo, estructura libre y nada de plantillas asignadas', () => {
    const texto = sistema();
    expect(texto).toContain('tú diseñas esta página desde cero');
    expect(texto).toContain('Playfair Display');
    expect(texto).toContain('Bebas Neue');
    expect(texto).toContain('de 4 a 10 bloques');
    expect(texto).toContain('puedes repetir tipos');
    expect(texto).not.toContain('Esta página usa la dirección');
  });

  it('incluye el punto de partida creativo, lo que debe evitar y los ejemplos de calidad', () => {
    const texto = sistema({ creative: creativeBrief('x'), avoid: ['títulos Syne, color #112233'], examples: qualityExamples('x', 2) });
    expect(texto).toContain('Punto de partida creativo');
    expect(texto).toContain(creativeBrief('x').estructura);
    expect(texto).toContain('[títulos Syne, color #112233]');
    expect(texto).toContain('NO los copies');
  });

  it('si la página ya tiene diseño, se le pide conservarlo exactamente', () => {
    const texto = sistema({ keepDesign: { fonts: { heading: 'Syne', body: 'Lato' } }, creative: creativeBrief('x') });
    expect(texto).toContain('NO debes cambiarlo');
    expect(texto).toContain('"Syne"');
    expect(texto).not.toContain('Punto de partida creativo');
  });

  it('sin paleta de marca le pide una propia y con paleta le exige usarla', () => {
    expect(sistema()).toContain('Diseña una paleta propia');
    expect(sistema()).toContain('NO uses por defecto un fondo crema');
    expect(sistema({ brandPalette: { primary: '#112233', secondary: '#223344', accent: '#334455', background: '#F0F0F0', text: '#101010' } })).toContain('EXACTAMENTE');
  });
});
