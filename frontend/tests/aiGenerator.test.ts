import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_BRIEF, templateOf, type Brief } from '@/features/funnels/catalog';
import { briefForAi, createAiGenerator } from '@/features/funnels/generation/aiGenerator';
import { pageGenerator } from '@/features/funnels/generation';
import { buildPage, templateGenerator } from '@/features/funnels/generation/templateGenerator';
import type { GenerationContext, GenerationInput } from '@/features/funnels/generation/types';
import { ApiError } from '@/services/api';
import * as funnelsService from '@/services/funnels';
import type { Funnel } from '@/services/funnels';
import type { Workspace } from '@/services/workspaces';
import type { Block } from '@/shared/blocks/types';

vi.mock('@/services/funnels', async (importOriginal) => ({ ...(await importOriginal<typeof funnelsService>()), generateFunnelPage: vi.fn() }));

const generar = vi.mocked(funnelsService.generateFunnelPage);

const PALETA_IA = { primary: '#111111', secondary: '#222222', accent: '#333333', background: '#FFFFFF', text: '#000000' };
const PALETA_MARCA = { primary: '#0E7A63', secondary: '#1B4D3E', accent: '#F4A261', background: '#FAFAFA', text: '#1A1A1A' };
const BLOQUES: Block[] = [
  { key: 'hero', type: 'encabezado', order: 1, content: { title: 'Escrito por la IA' }, style: {} },
  { key: 'cta', type: 'boton', order: 2, content: { label: 'Quiero entrar' }, style: {} },
];

const negocio = (brandPalette: Workspace['brandPalette'] = null): Workspace => ({
  id: 'w1',
  clientId: 'c1',
  name: 'Academia Nimbral',
  country: null,
  website: null,
  industry: null,
  logoFileId: null,
  brandPalette,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'client_admin',
});
const entrada = (brief: Partial<Brief> = {}, workspace = negocio()): GenerationInput => ({ workspace, objective: 'venta', brief: { ...EMPTY_BRIEF, ...brief }, templateId: 'impacto' });
const contexto = { funnel: { id: 'f1' } as Funnel, token: 'tok' } satisfies GenerationContext;
const respuesta = (extra: Partial<Funnel> = {}) => ({ id: 'f1', designSpec: { template: 'claridad', palette: PALETA_IA }, content: { blocks: BLOQUES }, ...extra }) as Funnel;

beforeEach(() => {
  generar.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('briefForAi: lo que se le cuenta a la IA', () => {
  it('manda solo lo que la persona escribió, con el tono por su nombre y el llamado a la acción', () => {
    const brief = { ...EMPTY_BRIEF, result: ' Tu primer empleo de datos ', objections: 'No tengo tiempo', tone: 'directo', cta: 'Quiero empezar', extra: '' };
    expect(briefForAi(brief)).toEqual({ result: 'Tu primer empleo de datos', objections: 'No tengo tiempo', tone: 'Directo', callToAction: 'Quiero empezar' });
  });

  it('omite los campos vacíos y recorta a 500 caracteres (el servidor rechaza lo más largo)', () => {
    expect(briefForAi({ ...EMPTY_BRIEF, tone: '' })).toEqual({});
    expect(briefForAi({ ...EMPTY_BRIEF, extra: 'x'.repeat(900) }).extra).toHaveLength(500);
  });
});

describe('generador con IA', () => {
  it('pide la página al servidor con el token, el funnel y el brief, y devuelve los bloques que escribió la IA', async () => {
    generar.mockResolvedValue(respuesta());
    const ia = createAiGenerator(templateGenerator);
    const page = await ia.generate(entrada({ result: 'Un resultado', tone: 'cercano' }), contexto);
    expect(generar).toHaveBeenCalledWith('tok', 'f1', { brief: { result: 'Un resultado', tone: 'Cercano' } });
    expect(page.blocks).toEqual(BLOQUES);
    expect(page.persisted).toBeUndefined();
  });

  it('si la persona eligió una plantilla se respeta; si dejó que la IA elija (null), se usa la que propuso la IA', async () => {
    generar.mockResolvedValue(respuesta());
    const ia = createAiGenerator(templateGenerator);
    expect((await ia.generate(entrada(), contexto)).designSpec.template).toBe('impacto');
    expect((await ia.generate({ ...entrada(), templateId: null }, contexto)).designSpec.template).toBe('claridad');
  });

  it('la paleta es la que dejó la IA (el servidor ya aplica la de la marca); si no hay, la de la marca; si tampoco, la de la plantilla', async () => {
    const ia = createAiGenerator(templateGenerator);
    generar.mockResolvedValue(respuesta());
    expect((await ia.generate(entrada({}, negocio(PALETA_MARCA)), contexto)).designSpec.palette).toEqual(PALETA_IA);
    expect((await ia.generate(entrada(), contexto)).designSpec.palette).toEqual(PALETA_IA);
    generar.mockResolvedValue(respuesta({ designSpec: { template: 'claridad' } }));
    expect((await ia.generate(entrada({}, negocio(PALETA_MARCA)), contexto)).designSpec.palette).toEqual(PALETA_MARCA);
    generar.mockResolvedValue(respuesta());
    generar.mockResolvedValue(respuesta({ designSpec: null }));
    expect((await ia.generate(entrada(), contexto)).designSpec.palette).toEqual(templateOf('impacto').palette);
  });

  it('conserva las tipografías que propuso la IA', async () => {
    generar.mockResolvedValue(respuesta({ designSpec: { template: 'claridad', fonts: { heading: 'Poppins', body: 'Inter' } } }));
    expect((await createAiGenerator(templateGenerator).generate(entrada(), contexto)).designSpec.fonts).toEqual({ heading: 'Poppins', body: 'Inter' });
  });

  it.each([503, 429])('si el servidor responde %s (sin IA o sin cuota), la persona sigue con la plantilla en lugar de quedarse sin página', async (status) => {
    generar.mockRejectedValue(new ApiError(status, 'AI_NOT_CONFIGURED', 'La IA no está disponible'));
    const entradaVenta = entrada();
    const page = await createAiGenerator(templateGenerator).generate(entradaVenta, contexto);
    expect(page).toEqual(buildPage(entradaVenta));
  });

  it('una respuesta sin bloques también cae a la plantilla', async () => {
    generar.mockResolvedValue(respuesta({ content: { blocks: [] } }));
    const entradaVenta = entrada();
    expect(await createAiGenerator(templateGenerator).generate(entradaVenta, contexto)).toEqual(buildPage(entradaVenta));
  });

  it.each([
    [new ApiError(401, 'UNAUTHORIZED', 'Sesión inválida')],
    [new ApiError(409, 'FUNNEL_PUBLISHED', 'Está publicado')],
    [new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos')],
    [new ApiError(0, 'NETWORK_ERROR', 'Sin conexión')],
  ])('un error real (%s) se muestra: no se esconde con la plantilla', async (error) => {
    generar.mockRejectedValue(error);
    await expect(createAiGenerator(templateGenerator).generate(entrada(), contexto)).rejects.toBe(error);
  });
});

describe('el generador que usa el asistente', () => {
  it('en el modo demostración (sin servidor) usa siempre la plantilla y no llama a la IA', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    const datos = entrada();
    expect(await pageGenerator.generate(datos, contexto)).toEqual(buildPage(datos));
    expect(generar).not.toHaveBeenCalled();
  });

  it('fuera de la demostración pide la página a la IA', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    generar.mockResolvedValue(respuesta());
    const page = await pageGenerator.generate(entrada(), contexto);
    expect(generar).toHaveBeenCalledTimes(1);
    expect(page.blocks).toEqual(BLOQUES);
  });
});
