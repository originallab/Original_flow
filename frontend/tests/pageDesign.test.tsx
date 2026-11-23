import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageRenderer } from '@/features/pageRenderer/PageRenderer';
import { fontsHref, readableOn, resolveTheme, toneOf } from '@/features/pageRenderer/theme';
import type { Block, DesignSpec } from '@/shared/blocks/types';
import * as back from '../../backend/src/funnel-types/design';
import { BACKGROUNDS, BLOCK_VARIANTS, BODY_FONTS, HEADING_FONTS, SINGLE_WEIGHT_FONTS, backgroundOf, variantOf } from '@/shared/design';

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
    expect(marca.background).toBe(PALETA.primary);
    expect(marca.color).toBe('#FFFFFF');
    expect(marca.theme.palette.primary).toBe('#FFFFFF');
    const oscuro = toneOf(base, 'dark');
    expect(oscuro.color).toBe('#FFFFFF');
    expect(oscuro.background).toBe(PALETA.text);
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
  });

  it('las de un solo grosor se piden sin pesos (Google Fonts rechazaría toda la petición) y no se engrosan', () => {
    expect(fontsHref({ heading: 'DM Serif Display', body: 'Lato' })).toBe('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Lato:wght@400;600&display=swap');
    expect(fontsHref({ heading: 'Syne', body: 'Open Sans' })).toBe('https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700;800&family=Open+Sans:wght@400;600&display=swap');
    expect(resolveTheme({ template: 'impacto', fonts: { heading: 'Bebas Neue', body: 'Inter' } }).look.headingWeight).toBe(400);
    expect(resolveTheme({ template: 'impacto', fonts: { heading: 'Syne', body: 'Inter' } }).look.headingWeight).toBe(800);
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
    expect(BACKGROUNDS).toHaveLength(4);
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
    expect(franja.style.background).toBe('rgb(119, 37, 190)');
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

  it('el texto destacado lleva una barra de color a la izquierda', () => {
    const { container } = render(<PageRenderer blocks={[bloque('t', 'texto', { body: 'Importante' }, { variant: 'destacado' })]} design={DISENO} />);
    expect(container.querySelector('.border-l-4')).not.toBeNull();
  });
});
