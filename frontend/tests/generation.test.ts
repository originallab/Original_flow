import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_BRIEF, TEMPLATES, templateOf, type Brief } from '@/features/funnels/catalog';
import { parsePrice, toNewFunnel } from '@/features/funnels/generation/briefToFunnel';
import { createDraft, fillDraft, pageGenerator } from '@/features/funnels/generation';
import { buildPage, templateGenerator } from '@/features/funnels/generation/templateGenerator';
import type { GeneratedPage, GenerationInput, PageGenerator } from '@/features/funnels/generation/types';
import { getFunnel, OBJECTIVES, type FunnelObjective } from '@/services/funnels';
import type { BrandPalette, Workspace } from '@/services/workspaces';
import { BLOCKS } from '@/shared/blocks/catalog';
import { validateBlocks } from '@/shared/blocks/validate';
import { startDemo } from './helpers/demoApp';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const negocio = (extra: Partial<Workspace> = {}): Workspace => ({
  id: 'w1',
  clientId: 'c1',
  name: 'Academia Nimbral',
  country: null,
  website: null,
  industry: null,
  logoFileId: null,
  brandPalette: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'client_admin',
  ...extra,
});
const entrada = (objective: FunnelObjective, brief: Partial<Brief> = {}, extra: Partial<GenerationInput> = {}): GenerationInput => ({
  workspace: negocio(),
  objective,
  brief: { ...EMPTY_BRIEF, ...brief },
  templateId: 'claridad',
  ...extra,
});

const DISPONIBLES: FunnelObjective[] = ['leads', 'venta', 'citas', 'magnet', 'webinar', 'aplicacion'];

describe('parsePrice', () => {
  it.each([
    ['$1,490 MXN', 1490, 'MXN'],
    ['4200', 4200, 'MXN'],
    ['USD 99.90', 99.9, 'USD'],
    ['99,90 dólares', 99.9, 'USD'],
    ['1,490.50', 1490.5, 'MXN'],
    ['$25,000 CLP', 25000, 'CLP'],
    ['desde 500 pesos chilenos', 500, 'CLP'],
    ['US$ 15', 15, 'USD'],
    ['Precio: 0', 0, 'MXN'],
  ])('«%s» → %d %s', (texto, monto, divisa) => {
    expect(parsePrice(texto)).toEqual({ amount: monto, currency: divisa });
  });

  it.each(['', 'Gratis', 'primera sesión gratis', 'consultar'])('«%s» no trae un monto', (texto) => {
    expect(parsePrice(texto)).toBeNull();
  });
});

describe('toNewFunnel (los datos del funnel en borrador)', () => {
  it('usa el nombre escrito, o el nombre del tipo de funnel si se dejó vacío', () => {
    expect(toNewFunnel(entrada('leads', { name: '  Mi curso  ' })).name).toBe('Mi curso');
    expect(toNewFunnel(entrada('leads', { name: '' })).name).toBe('Captar leads');
    expect(toNewFunnel(entrada('citas', { name: '   ' })).name).toBe('Agendar reuniones');
  });

  it('manda el negocio y el tipo, y recorta lo largo a lo que acepta el backend', () => {
    const datos = toNewFunnel(entrada('leads', { name: 'x'.repeat(200), offer: 'o'.repeat(300), audience: 'a'.repeat(400) }));
    expect(datos).toMatchObject({ workspaceId: 'w1', objective: 'leads', language: 'es' });
    expect(datos.name).toHaveLength(120);
    expect(datos.productName).toHaveLength(200);
    expect(datos.targetAudience).toHaveLength(300);
  });

  it('no manda lo opcional que se dejó vacío', () => {
    const datos = toNewFunnel(entrada('leads'));
    expect(datos).not.toHaveProperty('productName');
    expect(datos).not.toHaveProperty('targetAudience');
    expect(datos).not.toHaveProperty('price');
  });

  it('el precio solo viaja en un funnel de venta, con su divisa', () => {
    expect(toNewFunnel(entrada('venta', { price: '$1,490 USD' }))).toMatchObject({ price: 1490, currency: 'USD' });
    expect(toNewFunnel(entrada('venta', { price: 'Gratis' }))).not.toHaveProperty('price');
    expect(toNewFunnel(entrada('leads', { price: '$1,490' }))).not.toHaveProperty('price');
  });
});

describe('generador con plantilla', () => {
  it.each(DISPONIBLES)('arma una página válida para «%s», aunque no se haya escrito nada', (objetivo) => {
    const pagina = buildPage(entrada(objetivo));
    expect(pagina.blocks.length).toBeGreaterThan(0);
    expect(validateBlocks(pagina.blocks)).toEqual([]);
  });

  it.each(DISPONIBLES)('arma una página válida para «%s» con todo escrito, y con textos larguísimos', (objetivo) => {
    const largo = 'palabra '.repeat(400);
    const pagina = buildPage(entrada(objetivo, { name: largo, offer: largo, result: largo, price: '$1,000', audience: largo, objections: largo, cta: largo, extra: largo }));
    expect(validateBlocks(pagina.blocks)).toEqual([]);
  });

  it('lleva los bloques base de cada tipo de funnel, en ese orden (los mismos que define el backend)', () => {
    const tipos = (o: FunnelObjective) => buildPage(entrada(o)).blocks.map((b) => b.type);
    expect(tipos('leads')).toEqual(['encabezado', 'beneficios', 'testimonios', 'formulario', 'faq']);
    expect(tipos('venta')).toEqual(['encabezado', 'beneficios', 'testimonios', 'precios', 'faq', 'boton']);
    expect(tipos('citas')).toEqual(['encabezado', 'beneficios', 'formulario', 'calendario']);
    expect(tipos('magnet')).toEqual(['encabezado', 'imagen', 'formulario']);
    expect(tipos('webinar')).toEqual(['encabezado', 'agenda', 'formulario']);
    expect(tipos('aplicacion')).toEqual(['encabezado', 'requisitos', 'formulario']);
  });

  it('los tipos que todavía no están disponibles no generan bloques', () => {
    expect(buildPage(entrada('upsell')).blocks).toEqual([]);
    expect(buildPage(entrada('libre')).blocks).toEqual([]);
  });

  it('numera los bloques desde 1, con claves distintas y sin estilo', () => {
    const { blocks } = buildPage(entrada('venta'));
    expect(blocks.map((b) => b.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(blocks.map((b) => b.key)).size).toBe(blocks.length);
    expect(blocks.every((b) => Object.keys(b.style).length === 0)).toBe(true);
  });

  it('usa lo que la persona escribió: el resultado como título, la oferta como subtítulo y el texto del botón', () => {
    const { blocks } = buildPage(entrada('leads', { result: 'Ahorra 5 horas', offer: 'Un curso de Excel', audience: 'Administrativos', cta: 'Quiero mi lugar' }));
    expect(blocks.find((b) => b.type === 'encabezado')?.content).toEqual({ title: 'Ahorra 5 horas', subtitle: 'Un curso de Excel' });
    expect(blocks.find((b) => b.type === 'formulario')?.content).toMatchObject({ submitLabel: 'Quiero mi lugar' });
    expect(JSON.stringify(blocks.find((b) => b.type === 'beneficios')?.content)).toContain('Administrativos');
  });

  it('si no escribió nada, deja textos de ejemplo para completar (no páginas vacías)', () => {
    const { blocks } = buildPage(entrada('leads'));
    expect(blocks.find((b) => b.type === 'encabezado')?.content).toEqual({ title: 'Conoce Academia Nimbral', subtitle: 'Descubre cómo podemos ayudarte.' });
    expect(blocks.find((b) => b.type === 'formulario')?.content).toMatchObject({ submitLabel: 'Quiero más información' });
  });

  it('el subtítulo no repite el título cuando solo se escribió la oferta', () => {
    const { blocks } = buildPage(entrada('leads', { offer: 'Un curso de Excel' }));
    expect(blocks[0]?.content).toEqual({ title: 'Un curso de Excel', subtitle: 'Descubre cómo podemos ayudarte.' });
  });

  it('en una venta, el plan lleva el precio escrito; el botón, el texto de compra', () => {
    const { blocks } = buildPage(entrada('venta', { name: 'Curso de Excel', price: '$1,490 MXN', cta: 'Comprar ya' }));
    expect(blocks.find((b) => b.type === 'precios')?.content).toMatchObject({ plans: [{ name: 'Curso de Excel', price: 1490 }] });
    expect(blocks.find((b) => b.type === 'boton')?.content).toEqual({ label: 'Comprar ya' });
    expect(buildPage(entrada('venta', { price: 'Gratis' })).blocks.find((b) => b.type === 'precios')?.content).toMatchObject({ plans: [{ price: 0 }] });
  });

  it('cada tipo tiene el formulario que le corresponde', () => {
    const campos = (o: FunnelObjective) => (buildPage(entrada(o)).blocks.find((b) => b.type === 'formulario')?.content.fields as { name: string }[]).map((f) => f.name);
    expect(campos('leads')).toEqual(['nombre', 'email', 'telefono']);
    expect(campos('citas')).toEqual(['nombre', 'email', 'telefono', 'mensaje']);
    expect(campos('magnet')).toEqual(['nombre', 'email']);
    expect(campos('aplicacion')).toContain('motivo');
  });

  it('el formulario de cada página es una copia: cambiar uno no cambia los demás', () => {
    const a = buildPage(entrada('leads')).blocks.find((b) => b.type === 'formulario')!.content.fields as { label: string }[];
    a[0]!.label = 'Cambiado';
    const b = buildPage(entrada('leads')).blocks.find((b) => b.type === 'formulario')!.content.fields as { label: string }[];
    expect(b[0]!.label).toBe('Nombre');
  });

  it('el bloque de imagen del recurso trae una imagen de relleno que no usa la red', () => {
    const imagen = buildPage(entrada('magnet', { name: 'Guía' })).blocks.find((b) => b.type === 'imagen')!;
    expect(String(imagen.content.url).startsWith('data:image/svg+xml')).toBe(true);
    expect(imagen.content.alt).toBe('Portada de Guía');
  });

  it('el diseño es la plantilla elegida con la paleta de la marca del negocio, si la tiene', () => {
    const marca: BrandPalette = { primary: '#111111', secondary: '#222222', accent: '#333333', background: '#444444', text: '#555555' };
    expect(buildPage(entrada('leads', {}, { workspace: negocio({ brandPalette: marca }), templateId: 'impacto' })).designSpec).toEqual({ template: 'impacto', palette: marca });
  });

  it.each(TEMPLATES)('sin marca, usa la paleta propia de la plantilla «$id»', (plantilla) => {
    const diseno = buildPage(entrada('leads', {}, { templateId: plantilla.id })).designSpec;
    expect(diseno).toEqual({ template: plantilla.id, palette: templateOf(plantilla.id).palette });
  });

  it('el tono y las instrucciones adicionales son para la IA: la plantilla no los usa', () => {
    const base = buildPage(entrada('leads'));
    const conTono = buildPage(entrada('leads', { tone: 'divertido', extra: 'Usa emojis' }));
    expect(conTono).toEqual(base);
  });

  it('todos los bloques que genera existen en el catálogo del editor', () => {
    for (const o of OBJECTIVES) for (const b of buildPage(entrada(o)).blocks) expect(BLOCKS[b.type]).toBeDefined();
  });
});

describe('plantillas', () => {
  it.each(TEMPLATES)('la paleta de «$id» son cinco colores #RRGGBB', ({ palette }) => {
    expect(Object.keys(palette).sort()).toEqual(['accent', 'background', 'primary', 'secondary', 'text']);
    for (const color of Object.values(palette)) expect(color).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe('crear el borrador y armar la página (con el modo demostración)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
  });

  it('el generador que usa el asistente hoy es el de la plantilla', () => {
    expect(pageGenerator).toBe(templateGenerator);
    expect(pageGenerator.id).toBe('template');
  });

  it('crea el funnel y guarda en él el diseño y los bloques generados', async () => {
    const { token, workspace } = await startDemo();
    const datos = entrada('citas', { name: 'Mentoría', cta: 'Reservar' }, { workspace });
    const borrador = await createDraft(token, datos);
    expect(borrador).toMatchObject({ name: 'Mentoría', objective: 'citas', status: 'draft', content: { blocks: [] }, designSpec: null });
    await fillDraft(token, borrador, datos);
    const guardado = await getFunnel(token, borrador.id);
    expect(guardado.designSpec?.template).toBe('claridad');
    expect(guardado.content.blocks.map((b) => b.type)).toEqual(['encabezado', 'beneficios', 'formulario', 'calendario']);
  });

  it('se puede usar OTRO generador (por ejemplo, con IA) sin cambiar nada más', async () => {
    const { token, workspace } = await startDemo();
    const datos = entrada('leads', {}, { workspace });
    const borrador = await createDraft(token, datos);
    const conIa: PageGenerator = {
      id: 'ia-de-prueba',
      generate: vi.fn(async (): Promise<GeneratedPage> => ({
        designSpec: { template: 'impacto' },
        blocks: [{ key: 'hero', type: 'encabezado', order: 1, content: { title: 'Escrito por la IA' }, style: {} }],
      })),
    };
    await fillDraft(token, borrador, datos, conIa);
    expect(conIa.generate).toHaveBeenCalledWith(datos, { funnel: borrador, token });
    const guardado = await getFunnel(token, borrador.id);
    expect(guardado.designSpec).toEqual({ template: 'impacto' });
    expect(guardado.content.blocks[0]?.content).toEqual({ title: 'Escrito por la IA' });
  });

  it('si el generador ya guardó la página por su cuenta (persisted), no se vuelve a guardar', async () => {
    const { token, workspace } = await startDemo();
    const datos = entrada('leads', {}, { workspace });
    const borrador = await createDraft(token, datos);
    const guardaSolo: PageGenerator = { id: 'servidor', generate: async () => ({ designSpec: { template: 'minimal' }, blocks: [], persisted: true }) };
    await fillDraft(token, borrador, datos, guardaSolo);
    const guardado = await getFunnel(token, borrador.id);
    expect(guardado.designSpec).toBeNull();
    expect(guardado.content.blocks).toEqual([]);
  });

  it('si el generador falla no se guarda nada y se puede repetir sobre el mismo borrador', async () => {
    const { token, workspace } = await startDemo();
    const datos = entrada('leads', {}, { workspace });
    const borrador = await createDraft(token, datos);
    const fallaUnaVez: PageGenerator = { id: 'x', generate: vi.fn().mockRejectedValueOnce(new Error('La IA no responde')).mockImplementation(async (i: GenerationInput) => buildPage(i)) };
    await expect(fillDraft(token, borrador, datos, fallaUnaVez)).rejects.toThrow('La IA no responde');
    expect((await getFunnel(token, borrador.id)).content.blocks).toEqual([]);
    await fillDraft(token, borrador, datos, fallaUnaVez);
    expect((await getFunnel(token, borrador.id)).content.blocks.length).toBeGreaterThan(0);
  });
});
