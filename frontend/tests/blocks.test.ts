import { describe, expect, it } from 'vitest';
import { ADDABLE_BLOCKS, BLOCKS, PLACEHOLDER_IMAGE } from '@/shared/blocks/catalog';
import { BLOCK_TYPES, MAX_BLOCKS, type Block, type BlockType } from '@/shared/blocks/types';
import { fieldMessages, validateBlockContent, validateBlocks } from '@/shared/blocks/validate';

const paths = (type: BlockType, content: unknown) => validateBlockContent(type, content).map((i) => i.path.join('.'));
const bloque = (key: string, type: BlockType = 'boton', order = 1, content: Record<string, unknown> = { label: 'Ir' }): Block => ({ key, type, order, content, style: {} });

describe('catálogo de bloques', () => {
  it('tiene una definición para cada tipo de bloque, con su mismo nombre', () => {
    expect(Object.keys(BLOCKS).sort()).toEqual([...BLOCK_TYPES].sort());
    for (const type of BLOCK_TYPES) expect(BLOCKS[type].type).toBe(type);
  });

  it.each(BLOCK_TYPES)('el contenido inicial de «%s» es válido', (type) => {
    expect(validateBlockContent(type, BLOCKS[type].create())).toEqual([]);
  });

  it('el contenido inicial se crea nuevo cada vez (no se comparte entre bloques)', () => {
    const a = BLOCKS.formulario.create() as { fields: unknown[] };
    const b = BLOCKS.formulario.create() as { fields: unknown[] };
    expect(a).not.toBe(b);
    expect(a.fields).not.toBe(b.fields);
  });

  it('«logos» necesita subir archivos y no se ofrece al agregar bloques; los demás sí', () => {
    expect(ADDABLE_BLOCKS.map((d) => d.type)).not.toContain('logos');
    expect(ADDABLE_BLOCKS).toHaveLength(BLOCK_TYPES.length - 1);
  });

  it('la imagen de relleno es una dirección válida que no usa la red', () => {
    expect(PLACEHOLDER_IMAGE.startsWith('data:image/svg+xml')).toBe(true);
    expect(() => new URL(PLACEHOLDER_IMAGE)).not.toThrow();
  });

  it('cada campo de un formulario nuevo tiene un identificador interno distinto y válido', () => {
    const def = BLOCKS.formulario.fields.find((f) => f.kind === 'list');
    if (def?.kind !== 'list' || def.of.kind !== 'object') throw new Error('definición inesperada');
    const nombres = Array.from({ length: 20 }, () => def.of.kind === 'object' && (def.of.create() as { name: string }).name);
    expect(new Set(nombres).size).toBe(20);
    for (const nombre of nombres) expect(nombre).toMatch(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/);
  });
});

describe('validación del contenido de un bloque', () => {
  it('un texto obligatorio no puede faltar ni ser solo espacios, ni pasar de su largo máximo', () => {
    expect(paths('encabezado', {})).toEqual(['title']);
    expect(paths('encabezado', { title: '   ' })).toEqual(['title']);
    expect(paths('encabezado', { title: 'a'.repeat(201) })).toEqual(['title']);
    expect(paths('encabezado', { title: 'a'.repeat(200) })).toEqual([]);
    expect(validateBlockContent('encabezado', {})[0]?.message).toMatch(/obligatorio/i);
    expect(validateBlockContent('encabezado', { title: 'a'.repeat(201) })[0]?.message).toMatch(/máximo 200/i);
  });

  it('un texto opcional puede faltar, pero si está no puede ir vacío', () => {
    expect(paths('encabezado', { title: 'Hola' })).toEqual([]);
    expect(paths('encabezado', { title: 'Hola', subtitle: '' })).toEqual(['subtitle']);
    expect(paths('encabezado', { title: 'Hola', subtitle: 'a'.repeat(401) })).toEqual(['subtitle']);
  });

  it('el contenido debe ser un objeto', () => {
    expect(validateBlockContent('texto', null)).toHaveLength(1);
    expect(validateBlockContent('texto', 'hola')).toHaveLength(1);
    expect(validateBlockContent('texto', [])).toHaveLength(1);
  });

  it('un tipo que no es texto en un campo de texto se rechaza', () => {
    expect(paths('boton', { label: 5 })).toEqual(['label']);
  });

  it('la imagen necesita una dirección o un archivo, y la dirección debe ser válida', () => {
    expect(paths('imagen', {})).toEqual(['url']);
    expect(paths('imagen', { alt: 'x' })).toEqual(['url']);
    expect(paths('imagen', { fileId: 'f1' })).toEqual([]);
    expect(paths('imagen', { url: 'https://x.com/a.png' })).toEqual([]);
    expect(paths('imagen', { url: 'hola' })).toEqual(['url']);
    expect(paths('imagen', { url: PLACEHOLDER_IMAGE })).toEqual([]);
  });

  it('el video exige un enlace válido', () => {
    expect(paths('video', {})).toEqual(['url']);
    expect(paths('video', { url: 'no es un enlace' })).toEqual(['url']);
    expect(paths('video', { url: 'https://video.test/1' })).toEqual([]);
  });

  it('la cuenta regresiva exige una fecha ISO con segundos y zona horaria', () => {
    expect(paths('contador', {})).toEqual(['endsAt']);
    expect(paths('contador', { endsAt: '2026-12-01T18:00' })).toEqual(['endsAt']);
    expect(paths('contador', { endsAt: '2026-12-01T18:00:00' })).toEqual(['endsAt']);
    expect(paths('contador', { endsAt: '2026-13-45T18:00:00Z' })).toEqual(['endsAt']);
    expect(paths('contador', { endsAt: '2026-12-01T18:00:00Z' })).toEqual([]);
    expect(paths('contador', { endsAt: '2026-12-01T18:00:00.000Z' })).toEqual([]);
    expect(paths('contador', { endsAt: '2026-12-01T18:00:00-06:00' })).toEqual([]);
  });

  it('los precios: al menos un plan, máximo seis, precio numérico no negativo', () => {
    expect(paths('precios', {})).toEqual(['plans']);
    expect(paths('precios', { plans: [] })).toEqual(['plans']);
    const plan = { name: 'Plan', price: 10, features: [] };
    expect(paths('precios', { plans: Array.from({ length: 7 }, () => plan) })).toEqual(['plans']);
    expect(paths('precios', { plans: [{ ...plan, price: -1 }] })).toEqual(['plans.0.price']);
    expect(paths('precios', { plans: [{ ...plan, price: '10' }] })).toEqual(['plans.0.price']);
    expect(paths('precios', { plans: [{ ...plan, price: 0 }] })).toEqual([]);
    expect(paths('precios', { plans: [{ ...plan, name: '' }] })).toEqual(['plans.0.name']);
    expect(paths('precios', { plans: [{ ...plan, features: ['ok', ''] }] })).toEqual(['plans.0.features.1']);
  });

  it('el formulario: al menos un campo, identificador válido, tipo de la lista y texto de envío', () => {
    const campo = { name: 'nombre', label: 'Nombre', type: 'text', required: true };
    expect(paths('formulario', { fields: [], submitLabel: 'Enviar' })).toEqual(['fields']);
    expect(paths('formulario', { fields: [campo] })).toEqual(['submitLabel']);
    expect(paths('formulario', { fields: [{ ...campo, name: 'mi campo' }], submitLabel: 'x' })).toEqual(['fields.0.name']);
    expect(paths('formulario', { fields: [{ ...campo, name: '1abc' }], submitLabel: 'x' })).toEqual(['fields.0.name']);
    expect(paths('formulario', { fields: [{ ...campo, type: 'fecha' }], submitLabel: 'x' })).toEqual(['fields.0.type']);
    expect(paths('formulario', { fields: [{ ...campo, label: '' }], submitLabel: 'x' })).toEqual(['fields.0.label']);
    expect(paths('formulario', { fields: Array.from({ length: 31 }, () => campo), submitLabel: 'x' })).toEqual(['fields']);
    expect(paths('formulario', { fields: [campo], submitLabel: 'Enviar' })).toEqual([]);
  });

  it('las opciones de un campo solo se revisan si es una lista de opciones', () => {
    const base = { name: 'pais', label: 'País', required: false };
    expect(paths('formulario', { fields: [{ ...base, type: 'select', options: ['A', ''] }], submitLabel: 'x' })).toEqual(['fields.0.options.1']);
    expect(paths('formulario', { fields: [{ ...base, type: 'text', options: ['A', ''] }], submitLabel: 'x' })).toEqual([]);
  });

  it.each([
    ['testimonios', { items: [] }, ['items']],
    ['testimonios', { items: [{ name: 'A' }] }, ['items.0.quote']],
    ['faq', { items: [{ question: '¿?', answer: '' }] }, ['items.0.answer']],
    ['beneficios', { items: [{ description: 'x' }] }, ['items.0.title']],
    ['agenda', { items: [{ time: '10:00' }] }, ['items.0.title']],
    ['requisitos', { items: [] }, ['items']],
    ['requisitos', { items: ['uno', ''] }, ['items.1']],
  ] as [BlockType, unknown, string[]][])('%s con %j marca %j', (type, content, esperado) => {
    expect(paths(type, content)).toEqual(esperado);
  });

  it('las listas respetan su máximo (beneficios 12, preguntas 30, requisitos 30)', () => {
    expect(paths('beneficios', { items: Array.from({ length: 13 }, () => ({ title: 'x' })) })).toEqual(['items']);
    expect(paths('beneficios', { items: Array.from({ length: 12 }, () => ({ title: 'x' })) })).toEqual([]);
    expect(paths('requisitos', { items: Array.from({ length: 31 }, () => 'x') })).toEqual(['items']);
  });

  it('el calendario es opcional en todo, pero si trae enlace debe ser válido', () => {
    expect(paths('calendario', {})).toEqual([]);
    expect(paths('calendario', { url: 'nada' })).toEqual(['url']);
  });

  it('el botón exige su texto', () => {
    expect(paths('boton', {})).toEqual(['label']);
  });
});

describe('validación de la lista de bloques', () => {
  it('una lista válida (y la vacía) no tiene problemas', () => {
    expect(validateBlocks([])).toEqual([]);
    expect(validateBlocks([bloque('a'), bloque('b', 'boton', 2)])).toEqual([]);
  });

  it('las rutas de los problemas son las del backend: blocks.<n>.content.<campo>', () => {
    const issues = validateBlocks([bloque('a'), bloque('b', 'encabezado', 2, {})]);
    expect(issues.map((i) => i.path.join('.'))).toEqual(['blocks.1.content.title']);
  });

  it('las claves no pueden repetirse ni tener formas inválidas', () => {
    expect(validateBlocks([bloque('a'), bloque('a', 'boton', 2)]).map((i) => i.path.join('.'))).toEqual(['blocks.1.key']);
    for (const clave of ['', 'Mayúscula', 'con espacio', '-empieza', 'x'.repeat(51)]) {
      expect(validateBlocks([bloque(clave)]).map((i) => i.path.join('.')), clave).toEqual(['blocks.0.key']);
    }
  });

  it('el orden debe ser un entero entre 1 y 1000', () => {
    for (const orden of [0, 1001, 1.5, -2]) expect(validateBlocks([bloque('a', 'boton', orden)]).map((i) => i.path.join('.')), String(orden)).toEqual(['blocks.0.order']);
    expect(validateBlocks([bloque('a', 'boton', 1000)])).toEqual([]);
  });

  it('un tipo desconocido, un contenido que no es objeto y un bloque que no es objeto se rechazan', () => {
    expect(validateBlocks([{ ...bloque('a'), type: 'raro' }]).map((i) => i.path.join('.'))).toContain('blocks.0.type');
    expect(validateBlocks([{ ...bloque('a'), content: 'x' }]).map((i) => i.path.join('.'))).toContain('blocks.0.content');
    expect(validateBlocks(['x']).map((i) => i.path.join('.'))).toEqual(['blocks.0']);
    expect(validateBlocks('no es lista').map((i) => i.path.join('.'))).toEqual(['blocks']);
  });

  it(`acepta ${MAX_BLOCKS} bloques y rechaza ${MAX_BLOCKS + 1}`, () => {
    const lista = (n: number) => Array.from({ length: n }, (_, i) => bloque(`b${i}`, 'boton', i + 1));
    expect(validateBlocks(lista(MAX_BLOCKS))).toEqual([]);
    expect(validateBlocks(lista(MAX_BLOCKS + 1)).map((i) => i.path.join('.'))).toEqual(['blocks']);
  });

  it('el estilo es opcional, pero si viene debe ser un objeto', () => {
    const sinEstilo = { key: 'a', type: 'boton', order: 1, content: { label: 'Ir' } };
    expect(validateBlocks([sinEstilo])).toEqual([]);
    expect(validateBlocks([{ ...sinEstilo, style: 'x' }]).map((i) => i.path.join('.'))).toEqual(['blocks.0.style']);
  });
});

describe('fieldMessages', () => {
  it('da el primer mensaje de cada campo, con su ruta en puntos', () => {
    const mensajes = fieldMessages([
      { path: ['items', 0, 'title'], message: 'uno' },
      { path: ['items', 0, 'title'], message: 'dos' },
      { path: ['subtitle'], message: 'tres' },
    ]);
    expect(mensajes).toEqual({ 'items.0.title': 'uno', subtitle: 'tres' });
  });
});
