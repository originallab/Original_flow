import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageRenderer } from '@/features/pageRenderer/PageRenderer';
import { iconOf } from '@/features/pageRenderer/icons';
import { backdropStyle, buttonFill, dividerClip, fontsHref, headingStyle, readableOn, resolveTheme, toneOf } from '@/features/pageRenderer/theme';
import type { Block, DesignSpec } from '@/shared/blocks/types';
import * as back from '../../backend/src/funnel-types/design';
import { ICONS, BACKDROPS, BACKGROUNDS, BLOCK_VARIANTS, BODY_FONTS, BUTTONS, DIVIDERS, EFFECTS, SURFACES, HEADING_FONTS, SINGLE_WEIGHT_FONTS, backgroundOf, variantOf } from '@/shared/design';

const PALETA = { primary: '#7725BE', secondary: '#4A3B63', accent: '#F59E0B', background: '#FFFFFF', text: '#1F1A2B' };
const DISENO: DesignSpec = { template: 'claridad', palette: PALETA };

const bloque = (key: string, type: Block['type'], content: Block['content'], style: Block['style'] = {}, order = 1): Block => ({ key, type, order, content, style });
const ITEMS = [
  { title: 'Rápido', description: 'En minutos' },
  { title: 'Claro', description: 'Sin enredos' },
];

afterEach(() => document.head.querySelectorAll('link[data-page-fonts]').forEach((l) => l.remove()));

describe('el tema de una página', () => {
  it('sin ajustes usa el aspecto y las tipografías de su plantilla', () => {
    const t = resolveTheme({ template: 'impacto' });
    expect(t.look).toMatchObject({ radius: '0px', headingWeight: 800, headingTransform: 'uppercase' });
    expect(t.fonts).toEqual({ heading: 'Oswald', body: 'Open Sans' });
  });

  it('lo que elige la página (aspecto y tipografías) manda sobre la plantilla', () => {
    const t = resolveTheme({ template: 'impacto', look: { radius: 'pill', density: 'airy', align: 'center', headingCase: 'normal', headingWeight: 500 }, fonts: { heading: 'Playfair Display', body: 'Lato' } });
    expect(t.look).toMatchObject({ radius: '999px', spacing: 1.6, align: 'center', headingWeight: 500, headingTransform: 'none' });
    expect(t.fonts).toEqual({ heading: 'Playfair Display', body: 'Lato' });
  });

  it('una tipografía fuera del catálogo se ignora (no se carga nada raro desde Internet)', () => {
    expect(resolveTheme({ template: 'claridad', fonts: { heading: 'x&y', body: 'Inter' } }).fonts).toEqual({ heading: 'Montserrat', body: 'Inter' });
    expect(fontsHref({ heading: 'Playfair Display', body: 'Open Sans' })).toContain('family=Playfair+Display');
  });

  it('el texto sobre un fondo claro es oscuro y sobre uno oscuro es blanco, aunque el texto de la paleta sea claro', () => {
    expect(readableOn('#FFFFFF', PALETA)).toBe(PALETA.text);
    expect(readableOn('#101010', PALETA)).toBe('#FFFFFF');
    expect(readableOn('#FFFFFF', { ...PALETA, text: '#FFFFFF' })).toBe('#17161C');
  });

  it('los fondos de franja ajustan los colores para que se lea: color de la marca y oscuro', () => {
    const base = resolveTheme(DISENO);
    expect(toneOf(base, 'base').background).toBeNull();
    expect(toneOf(base, 'alt').theme).toBe(base);
    const marca = toneOf(base, 'accent');
    expect(marca.background).toContain(PALETA.primary);
    expect(marca.bleed).toBe(`0 0 0 100vmax ${PALETA.primary}`);
    expect(marca.color).toBe('#FFFFFF');
    expect(marca.theme.palette.primary).toBe('#FFFFFF');
    const oscuro = toneOf(base, 'dark');
    expect(oscuro.color).toBe('#FFFFFF');
    expect(oscuro.background).toContain(PALETA.text);
    expect(oscuro.theme.surface.background).not.toBe(base.surface.background);
  });
});

describe('tipografías', () => {
  it('el catálogo del front es el mismo que el del backend', () => {
    expect([...HEADING_FONTS]).toEqual([...back.HEADING_FONTS]);
    expect([...BODY_FONTS]).toEqual([...back.BODY_FONTS]);
    expect([...SINGLE_WEIGHT_FONTS]).toEqual([...back.SINGLE_WEIGHT_FONTS]);
    expect(BLOCK_VARIANTS).toEqual(back.BLOCK_VARIANTS);
    expect([...BACKGROUNDS]).toEqual([...back.BACKGROUNDS]);
    expect([...ICONS]).toEqual([...back.ICONS]);
    expect([[...SURFACES], [...EFFECTS], [...BACKDROPS], [...DIVIDERS], [...BUTTONS]]).toEqual([[...back.SURFACES], [...back.EFFECTS], [...back.BACKDROPS], [...back.DIVIDERS], [...back.BUTTONS]]);
  });

  it('las de un solo grosor se piden sin pesos (Google Fonts rechazaría toda la petición) y no se engrosan', () => {
    expect(fontsHref({ heading: 'DM Serif Display', body: 'Lato' })).toBe('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Lato:wght@400;600&display=swap');
    expect(fontsHref({ heading: 'Syne', body: 'Open Sans' })).toBe('https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700;800&family=Open+Sans:wght@400;600&display=swap');
    expect(resolveTheme({ template: 'impacto', fonts: { heading: 'Bebas Neue', body: 'Inter' } }).look.headingWeight).toBe(400);
    expect(resolveTheme({ template: 'impacto', fonts: { heading: 'Syne', body: 'Inter' } }).look.headingWeight).toBe(800);
  });
});

describe('recursos visuales por tema', () => {
  const OSCURA = { primary: '#22D3EE', secondary: '#A78BFA', accent: '#F472B6', background: '#0A0A12', text: '#E6E6F0' };
  const tema = (look: object, palette = PALETA) => resolveTheme({ template: 'claridad', palette, look });

  it('cada estilo de tarjeta se dibuja distinto y se adapta al fondo', () => {
    const estilos = (['flat', 'outline', 'elevated', 'glass', 'glow'] as const).map((surface) => JSON.stringify(tema({ surface }).surface));
    expect(new Set(estilos).size).toBe(5);
    expect(tema({ surface: 'elevated' }).surface.shadow).toBeTruthy();
    expect(tema({ surface: 'glass' }).surface.blur).toBeTruthy();
    expect(tema({ surface: 'glow' }).surface.border).toBe(PALETA.primary);
    expect(tema({ surface: 'outline' }).surface.background).toBe('transparent');
    expect(JSON.stringify(tema({ surface: 'elevated' }, OSCURA).surface)).not.toBe(JSON.stringify(tema({ surface: 'elevated' }).surface));
  });

  it('el efecto de los títulos: degradado, brillo o subrayado, y ninguno por defecto', () => {
    expect(headingStyle(tema({ effect: 'gradient' })).backgroundImage).toContain('linear-gradient');
    expect(headingStyle(tema({ effect: 'gradient' })).color).toBe('transparent');
    expect(headingStyle(tema({ effect: 'glow' }, OSCURA)).textShadow).toContain(OSCURA.primary);
    expect(headingStyle(tema({ effect: 'underline' })).textDecoration).toBe('underline');
    expect(headingStyle(tema({}))).toEqual({ fontWeight: 700, textTransform: 'none' });
  });

  it('el fondo de la página: cuadrícula, puntos, degradado y resplandor; liso por defecto', () => {
    expect(backdropStyle(tema({ backdrop: 'grid' })).backgroundSize).toBe('36px 36px, 36px 36px');
    expect(backdropStyle(tema({ backdrop: 'dots' })).backgroundImage).toContain('radial-gradient');
    expect(backdropStyle(tema({ backdrop: 'gradient' })).backgroundImage).toContain('linear-gradient');
    expect(backdropStyle(tema({ backdrop: 'glow' }, OSCURA)).backgroundImage).toContain('ellipse');
    expect(backdropStyle(tema({}))).toEqual({});
  });

  it('los botones: sólido, con degradado o con brillo', () => {
    expect(buttonFill(tema({})).background).toBe(PALETA.primary);
    expect(buttonFill(tema({ button: 'gradient' })).background).toContain('linear-gradient');
    expect(buttonFill(tema({ button: 'glow' })).boxShadow).toContain(PALETA.primary);
  });

  it('la página aplica la decoración de fondo, el efecto de títulos y el corte en diagonal', () => {
    const bloques = [bloque('h', 'encabezado', { title: 'Hola' }, { background: 'dark' }, 1), bloque('t', 'texto', { body: 'Texto' }, {}, 2)];
    const { container } = render(<PageRenderer blocks={bloques} design={{ ...DISENO, palette: OSCURA, look: { backdrop: 'grid', effect: 'glow', divider: 'slant', surface: 'glow' } }} />);
    const pagina = screen.getByRole('article', { name: 'Página' });
    expect(pagina.style.backgroundImage).toContain('linear-gradient');
    expect(within(container).getByRole('heading', { level: 1 }).style.textShadow).toContain(OSCURA.primary);
    const franja = container.querySelector<HTMLElement>('[data-block-key="h"]')!;
    expect(franja.style.clipPath).toContain('polygon');
    // la última franja no se corta
    expect(container.querySelector<HTMLElement>('[data-block-key="t"]')!.style.clipPath).toBe('');
  });

  it('en la página publicada la franja en diagonal sigue ocupando todo el ancho', () => {
    const { container } = render(<PageRenderer mode="public" blocks={[bloque('h', 'encabezado', { title: 'Hola' }, { background: 'dark' }, 1), bloque('t', 'texto', { body: 'x' }, {}, 2)]} design={{ ...DISENO, look: { divider: 'slant' } }} />);
    expect(container.querySelector<HTMLElement>('[data-block-key="h"]')!.style.clipPath).toContain('100vmax');
  });

  it('las tarjetas toman el estilo elegido', () => {
    const { container } = render(<PageRenderer blocks={[bloque('b', 'beneficios', { title: 'T', items: ITEMS })]} design={{ ...DISENO, look: { surface: 'elevated' } }} />);
    expect(container.querySelector<HTMLElement>('.p-5')!.style.boxShadow).toBeTruthy();
  });
});

describe('profundidad: franjas con degradado y malla, cortes, íconos y patrón', () => {
  const tema = (look: object = {}, pattern?: object) => resolveTheme({ template: 'claridad', palette: PALETA, look, pattern } as DesignSpec);

  it('la franja de degradado va de la marca a un segundo color y llena la pantalla con una sombra por lado', () => {
    const t = toneOf(tema(), 'gradient');
    expect(t.background).toContain('linear-gradient(90deg');
    expect(t.bleed).toMatch(/^50vmax 0 0 50vmax #[0-9A-F]{6}, -50vmax 0 0 50vmax #7725BE$/);
    expect(['#FFFFFF', PALETA.text]).toContain(t.color);
  });

  it('la franja de malla es oscura con manchas de color y las franjas oscuras y de color llevan un brillo para no verse planas', () => {
    expect(toneOf(tema(), 'mesh').background).toContain('radial-gradient');
    expect(toneOf(tema(), 'mesh').color).toBe('#FFFFFF');
    expect(toneOf(tema(), 'dark').background).toContain('radial-gradient');
    expect(toneOf(tema(), 'accent').background).toContain('linear-gradient(135deg');
    expect(toneOf(tema(), 'alt').bleed).toContain('100vmax');
    expect(toneOf(tema(), 'base').bleed).toBeNull();
  });

  it('el corte de las franjas: diagonal, ondulado y zigzag, y más ancho que la pantalla en la página publicada', () => {
    expect(dividerClip('none', false)).toBeNull();
    expect(dividerClip(undefined, true)).toBeNull();
    for (const kind of ['slant', 'wave', 'zigzag'] as const) {
      const normal = dividerClip(kind, false)!;
      expect(normal.clipPath).toMatch(/^polygon\(/);
      expect(normal.paddingBottom).toBe('2.5rem');
      expect(normal.clipPath).not.toContain('vmax');
      expect(dividerClip(kind, true)!.clipPath).toContain('-100vmax 0, calc(100% + 100vmax) 0');
    }
    expect(dividerClip('wave', false)!.clipPath.split(',').length).toBeGreaterThan(40);
    expect(dividerClip('zigzag', false)!.clipPath.split(',').length).toBe(17 + 2);
    expect(new Set(['slant', 'wave', 'zigzag'].map((k) => dividerClip(k as never, false)!.clipPath)).size).toBe(3);
  });

  it('la página aplica el corte ondulado a las franjas de color (menos la última)', () => {
    const { container } = render(<PageRenderer blocks={[bloque('a', 'texto', { body: 'a' }, { background: 'dark' }, 1), bloque('b', 'texto', { body: 'b' }, { background: 'mesh' }, 2)]} design={{ ...DISENO, look: { divider: 'wave' } }} />);
    expect(container.querySelector<HTMLElement>('[data-block-key="a"]')!.style.clipPath).toContain('polygon');
    expect(container.querySelector<HTMLElement>('[data-block-key="b"]')!.style.clipPath).toBe('');
  });

  it('los íconos de los beneficios: solo los del catálogo se dibujan', () => {
    expect(iconOf('rocket')).toBeDefined();
    for (const name of ICONS) expect(iconOf(name), name).toBeDefined();
    expect(iconOf('inventado')).toBeUndefined();
    expect(iconOf(5)).toBeUndefined();
  });

  it('un beneficio con ícono lo muestra en lugar del número, en tarjetas, columnas y lista', () => {
    const items = [{ title: 'Rápido', icon: 'rocket' }, { title: 'Sin ícono' }];
    const dibujo = (variant?: string) => {
      const { container, unmount } = render(<PageRenderer blocks={[bloque('b', 'beneficios', { items }, variant ? { variant } : {})]} design={DISENO} />);
      const html = container.innerHTML;
      unmount();
      return html;
    };
    const tarjetas = dibujo();
    expect(tarjetas).toContain('lucide-rocket');
    expect(tarjetas).toContain('>2<');
    expect(dibujo('columnas')).toContain('lucide-rocket');
    const lista = dibujo('lista');
    expect(lista).toContain('lucide-rocket');
    expect(lista).toContain('lucide-check');
    expect(dibujo('numerados')).toContain('01');
  });

  it('el patrón de fondo: mosaico del tamaño elegido, cubrir toda la página y velo del color de fondo', () => {
    const url = 'https://maas.ejemplo.com/public/acme/patron.png';
    const mosaico = backdropStyle(tema({}, { assetId: 'a', url, mode: 'tile', scale: 'lg', dim: 0 }));
    expect(mosaico.backgroundImage).toBe(`url("${url}")`);
    expect(mosaico.backgroundSize).toBe('320px auto');
    expect(mosaico.backgroundRepeat).toBe('repeat');
    const cubrir = backdropStyle(tema({}, { assetId: 'a', url, mode: 'cover', scale: 'md', dim: 50 }));
    expect(cubrir.backgroundImage).toMatch(/^linear-gradient\(#FFFFFF80, #FFFFFF80\), url\(/);
    expect(cubrir.backgroundSize).toBe('auto, cover');
    expect(cubrir.backgroundRepeat).toBe('repeat, no-repeat');
    expect(cubrir.backgroundPosition).toBe('center');
  });

  it('el patrón va debajo de la decoración (cuadrícula) y solo se usa si su dirección es http(s)', () => {
    const url = 'https://maas.ejemplo.com/patron.png';
    const ambos = backdropStyle(tema({ backdrop: 'dots' }, { assetId: 'a', url, mode: 'tile', scale: 'sm', dim: 25 }));
    expect(ambos.backgroundImage!.indexOf('radial-gradient')).toBeLessThan(ambos.backgroundImage!.indexOf('url('));
    expect(ambos.backgroundSize).toContain('120px auto');
    for (const malo of ['javascript:alert(1)', 'data:image/svg+xml;base64,AAAA', '', undefined]) {
      expect(backdropStyle(tema({}, { assetId: 'a', url: malo, mode: 'tile', scale: 'md', dim: 0 }))).toEqual({});
    }
  });

  it('un patrón con comillas en la dirección no puede salirse del url()', () => {
    const style = backdropStyle(tema({}, { assetId: 'a', url: 'https://x.test/a"b.png', mode: 'tile', scale: 'md', dim: 0 }));
    expect(style.backgroundImage).not.toContain('a"b');
    expect(style.backgroundImage).toContain('%22');
  });

  it('la página muestra el patrón de fondo', () => {
    render(<PageRenderer blocks={[bloque('a', 'texto', { body: 'a' })]} design={{ ...DISENO, pattern: { assetId: 'a', url: 'https://maas.ejemplo.com/p.png', mode: 'tile', scale: 'md', dim: 0 } }} />);
    expect(screen.getByRole('article', { name: 'Página' }).style.backgroundImage).toContain('https://maas.ejemplo.com/p.png');
  });
});

describe('más formas de dibujar los bloques', () => {
  const dibujo = (type: Block['type'], content: Block['content'], variant: string) => {
    const { container, unmount } = render(<PageRenderer blocks={[bloque('x', type, content, { variant })]} design={DISENO} />);
    const html = container.innerHTML;
    unmount();
    return html;
  };
  const ITEMS_I = [{ title: 'Rápido', description: 'En minutos', icon: 'rocket' }, { title: 'Claro' }, { title: 'Tuyo', icon: 'heart' }];

  it('cada tipo de bloque con formas se dibuja distinto en cada una (ninguna se parece a otra)', () => {
    const contenidos: Partial<Record<Block['type'], Block['content']>> = {
      encabezado: { title: 'Hola', subtitle: 'Sub' },
      texto: { title: 'T', body: 'Cuerpo' },
      beneficios: { title: 'B', items: ITEMS_I },
      faq: { items: [{ question: '¿A?', answer: 'B' }, { question: '¿C?', answer: 'D' }] },
      precios: { plans: [{ name: 'A', price: 1, features: ['x'] }, { name: 'B', price: 2, features: ['y'] }, { name: 'C', price: 3, features: ['z'] }] },
      boton: { label: 'Ir' },
    };
    for (const [type, variantes] of Object.entries(BLOCK_VARIANTS)) {
      const html = variantes!.map((v) => dibujo(type as Block['type'], contenidos[type as Block['type']]!, v));
      expect(new Set(html).size, type).toBe(variantes!.length);
    }
  });

  it('los encabezados nuevos: pancarta (círculos de fondo), con acento (barra de color) y editorial (regla y subtítulo en cursiva)', () => {
    const e = { title: 'Hola', subtitle: 'Sub' };
    expect(dibujo('encabezado', e, 'pancarta')).toContain('rounded-full opacity-25');
    expect(dibujo('encabezado', e, 'acento')).toContain('h-1.5 w-20');
    const editorial = dibujo('encabezado', e, 'editorial');
    expect(editorial).toContain('h-1 w-24');
    expect(editorial).toContain('italic');
  });

  it('beneficios con íconos grandes, alternados y como etiquetas', () => {
    const iconos = dibujo('beneficios', { items: ITEMS_I }, 'iconos');
    expect(iconos).toContain('lucide-rocket');
    expect(iconos).toContain('>2<');
    const alterno = dibujo('beneficios', { items: ITEMS_I }, 'alternado');
    expect(alterno).toContain('sm:flex-row-reverse');
    expect(alterno.match(/sm:flex-row-reverse/g)).toHaveLength(1);
    const chips = dibujo('beneficios', { items: ITEMS_I }, 'chips');
    expect(chips).toContain('rounded-full px-5');
    expect(chips).toContain('lucide-heart');
    expect(chips).toContain('lucide-check');
  });

  it('el texto en cita lleva comillas grandes; las preguntas en columnas, dos columnas; y el precio destacado resalta uno', () => {
    expect(dibujo('texto', { body: 'Algo importante' }, 'cita')).toContain('italic');
    expect(dibujo('faq', { items: [{ question: '¿A?', answer: 'B' }] }, 'columnas')).toContain('sm:grid-cols-2');
    const planes = { plans: [{ name: 'A', price: 1, features: ['x'] }, { name: 'B', price: 2, features: ['y'] }, { name: 'C', price: 3, features: ['z'] }] };
    const destacado = dibujo('precios', planes, 'destacado');
    expect(destacado.match(/scale\(1\.05\)/g)).toHaveLength(1);
    expect(dibujo('precios', planes, 'tarjetas')).not.toContain('scale(1.05)');
  });
});

describe('el catálogo de diseño', () => {
  it('solo reconoce variantes y fondos de su lista', () => {
    expect(variantOf('beneficios', { variant: 'lista' })).toBe('lista');
    expect(variantOf('beneficios', { variant: 'solido' })).toBeUndefined();
    expect(variantOf('imagen', { variant: 'lista' })).toBeUndefined();
    expect(backgroundOf({ background: 'dark' })).toBe('dark');
    expect(backgroundOf({ background: 'neon' })).toBe('base');
    expect(backgroundOf(undefined)).toBe('base');
    expect(BACKGROUNDS).toHaveLength(6);
    for (const variantes of Object.values(BLOCK_VARIANTS)) expect(variantes?.length).toBeGreaterThan(1);
  });
});

describe('PageRenderer con diseño propio', () => {
  it('carga las tipografías de la página una sola vez y las aplica', () => {
    const diseno: DesignSpec = { ...DISENO, fonts: { heading: 'Playfair Display', body: 'Lato' } };
    const { rerender } = render(<PageRenderer blocks={[bloque('a', 'texto', { body: 'Hola' })]} design={diseno} />);
    rerender(<PageRenderer blocks={[bloque('a', 'texto', { body: 'Hola' })]} design={diseno} />);
    const enlaces = document.head.querySelectorAll('link[data-page-fonts]');
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0]?.getAttribute('href')).toContain('Playfair+Display');
    const pagina = screen.getByRole('article', { name: 'Página' });
    expect(pagina.style.fontFamily).toContain('Lato');
    expect(pagina.style.getPropertyValue('--page-heading')).toContain('Playfair Display');
  });

  it('un bloque con fondo de la marca se pinta con ese color y con texto legible', () => {
    const { container } = render(<PageRenderer blocks={[bloque('a', 'texto', { body: 'Hola' }, { background: 'accent' })]} design={DISENO} />);
    const franja = container.querySelector<HTMLElement>('[data-block-key="a"]')!;
    expect(franja.getAttribute('style')).toContain('rgb(119, 37, 190)');
    expect(franja.style.color).toBe('rgb(255, 255, 255)');
  });

  it('en la página publicada la franja llena todo el ancho', () => {
    const { container } = render(<PageRenderer mode="public" blocks={[bloque('a', 'texto', { body: 'Hola' }, { background: 'dark' })]} design={DISENO} />);
    expect(container.querySelector<HTMLElement>('[data-block-key="a"]')!.style.clipPath).toContain('100vmax');
  });

  it('sin fondo elegido no pinta franja', () => {
    const { container } = render(<PageRenderer blocks={[bloque('a', 'texto', { body: 'Hola' })]} design={DISENO} />);
    expect(container.querySelector<HTMLElement>('[data-block-key="a"]')!.style.background).toBe('');
  });

  it('el aire de la página cambia el relleno de las franjas', () => {
    const relleno = (density: 'compact' | 'airy') => {
      const { container, unmount } = render(<PageRenderer blocks={[bloque('a', 'texto', { body: 'Hola' })]} design={{ ...DISENO, look: { density } }} />);
      const valor = container.querySelector<HTMLElement>('section')!.style.paddingBlock;
      unmount();
      return Number.parseFloat(valor);
    };
    expect(relleno('airy')).toBeGreaterThan(relleno('compact'));
  });

  it('los beneficios se dibujan distinto según la variante', () => {
    const dibujo = (variant?: string) => {
      const { container, unmount } = render(<PageRenderer blocks={[bloque('b', 'beneficios', { title: 'Por qué', items: ITEMS }, variant ? { variant } : {})]} design={DISENO} />);
      const html = container.innerHTML;
      const lista = container.querySelectorAll('ul li').length;
      unmount();
      return { html, lista };
    };
    const tarjetas = dibujo();
    const lista = dibujo('lista');
    const numerados = dibujo('numerados');
    const columnas = dibujo('columnas');
    expect(tarjetas.lista).toBe(0);
    expect(lista.lista).toBe(2);
    expect(numerados.lista).toBe(2);
    expect(numerados.html).toContain('01');
    expect(columnas.html).toContain('border-t-4');
    expect(new Set([tarjetas.html, lista.html, numerados.html, columnas.html]).size).toBe(4);
  });

  it('el encabezado «grande» y el «dividido» cambian de forma', () => {
    const encabezado = (variant: string) => render(<PageRenderer blocks={[bloque('h', 'encabezado', { title: 'Título', subtitle: 'Sub' }, { variant })]} design={DISENO} />);
    const grande = encabezado('grande');
    expect(within(grande.container).getByRole('heading', { level: 1 }).className).toContain('text-7xl');
    grande.unmount();
    const dividido = encabezado('dividido');
    expect(dividido.container.querySelector('.grid')).not.toBeNull();
    dividido.unmount();
    const centrado = encabezado('centrado');
    expect(centrado.container.querySelector<HTMLElement>('section')!.style.textAlign).toBe('center');
  });

  it('las preguntas frecuentes en tarjetas llevan borde; las compactas no', () => {
    const faq = (variant: string) => {
      const { container, unmount } = render(<PageRenderer blocks={[bloque('f', 'faq', { items: [{ question: '¿Cuánto?', answer: 'Poco' }] }, { variant })]} design={DISENO} />);
      const borde = container.querySelector<HTMLElement>('dl > div')!.style.border;
      unmount();
      return borde;
    };
    expect(faq('tarjetas')).not.toBe('');
    expect(faq('compacto')).toBe('');
  });

  it('los precios «simples» van en filas, sin tarjetas', () => {
    const { container } = render(<PageRenderer blocks={[bloque('p', 'precios', { plans: [{ name: 'Único', price: 990, features: ['Uno', 'Dos'] }] }, { variant: 'simple' })]} design={DISENO} />);
    expect(container.querySelector('.divide-y')).not.toBeNull();
    expect(screen.getByText('Uno · Dos')).toBeTruthy();
    expect(screen.getByText(/990/)).toBeTruthy();
  });

  it('el botón de contorno es transparente y el de banda va sobre una franja de la marca', () => {
    const boton = (variant: string) => {
      const { container, unmount } = render(<PageRenderer blocks={[bloque('c', 'boton', { label: 'Entrar' }, { variant })]} design={DISENO} />);
      const span = screen.getByText('Entrar');
      const seccion = container.querySelector<HTMLElement>('section')!;
      const resultado = { fondo: span.style.background, franja: seccion.style.background, borde: span.style.border };
      unmount();
      return resultado;
    };
    expect(boton('contorno').fondo).toBe('transparent');
    expect(boton('contorno').borde).toContain('2px solid');
    expect(boton('banda').franja).toBe('rgb(119, 37, 190)');
    expect(boton('solido').franja).toBe('');
  });

  it('el bloque de imagen toma el tamaño de la imagen: sin recortarla, estirarla ni fijarle altura', () => {
    render(<PageRenderer blocks={[bloque('i', 'imagen', { url: 'https://x.test/foto.png', alt: 'Foto' })]} design={DISENO} />);
    const img = screen.getByRole('img', { name: 'Foto' });
    expect(img.className).toContain('h-auto');
    expect(img.className).toContain('w-auto');
    expect(img.className).toContain('max-w-full');
    expect(img.className).toContain('object-contain');
    expect(img.className).not.toContain('object-cover');
    expect(img.className).not.toContain('max-h-96');
  });

  it('el texto destacado lleva una barra de color a la izquierda', () => {
    const { container } = render(<PageRenderer blocks={[bloque('t', 'texto', { body: 'Importante' }, { variant: 'destacado' })]} design={DISENO} />);
    expect(container.querySelector('.border-l-4')).not.toBeNull();
  });
});
