import { describe, expect, it } from 'vitest';
import { createAiEngineClient } from '../src/integrations/ai-engine/client.js';
import { AI_BLOCK_TYPES } from '../src/integrations/ai-engine/prompts.js';
import { validateBlockContent } from '../src/funnel-types/blocks.js';
import { createLogger } from '../src/lib/logger.js';
import { generatedPageSchema } from '../src/schemas/ai.schemas.js';
import { contentBodySchema } from '../src/schemas/funnel.schemas.js';
import { createOperationLogService } from '../src/services/operationLog.service.js';

/**
 * Prueba de humo contra IA Engine DE VERDAD (gasta unos centavos). Solo corre si se pasan las llaves por el
 * entorno: IAENGINE_LIVE_API_KEY y IAENGINE_LIVE_SECRET_KEY (y, si se quiere, IAENGINE_LIVE_MODEL). Nunca corre
 * sola ni en CI.
 */
const apiKey = process.env.IAENGINE_LIVE_API_KEY;
const secretKey = process.env.IAENGINE_LIVE_SECRET_KEY;

describe.skipIf(!apiKey || !secretKey)('IA Engine real (prueba de humo opcional)', () => {
  const logger = createLogger('silent');
  const client = createAiEngineClient({
    baseUrl: process.env.IAENGINE_LIVE_BASE_URL ?? 'https://api.ai.impactcore.net',
    apiKey: apiKey as string,
    secretKey: secretKey as string,
    model: process.env.IAENGINE_LIVE_MODEL ?? 'gpt-5.4-mini',
    timeoutMs: 120_000,
    logger,
    operationLog: createOperationLogService({ create: async () => undefined }, logger),
  });
  const ctx = { requestId: 'req_prueba_en_vivo', workspaceId: '11111111-1111-4111-8111-111111111111' };

  it('genera una página de venta que pasa la validación del editor', async () => {
    const t0 = Date.now();
    const proposal = await client.generatePage(
      { ...ctx, action: 'generate_page' },
      {
        objective: 'venta',
        language: 'es',
        name: 'Curso de análisis de datos',
        productName: 'Datos desde cero',
        targetAudience: 'Personas que quieren cambiar a una carrera de datos',
        price: 1200,
        currency: 'MXN',
        brandBrief: { name: 'Datos MX', tone: 'cercano y profesional' },
        blockTypes: AI_BLOCK_TYPES,
        baseBlocks: ['encabezado', 'beneficios', 'testimonios', 'precios', 'faq', 'boton'],
      },
    );
    const segundos = ((Date.now() - t0) / 1000).toFixed(1);
    const parsed = generatedPageSchema.safeParse(proposal);
    if (!parsed.success) console.log('RESPUESTA INVÁLIDA:', JSON.stringify(proposal, null, 2), JSON.stringify(parsed.error.issues, null, 2));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const contenido = contentBodySchema.safeParse({ blocks: parsed.data.blocks });
    if (!contenido.success) console.log('BLOQUES INVÁLIDOS:', JSON.stringify(contenido.error.issues, null, 2));
    expect(contenido.success).toBe(true);
    console.log(`PÁGINA GENERADA en ${segundos} s:\n${JSON.stringify(parsed.data, null, 2)}`);
  }, 150_000);

  it('reescribe un bloque con una indicación y devuelve contenido válido para su tipo', async () => {
    const proposal = (await client.regenerateBlock(
      { ...ctx, action: 'regenerate_block' },
      { objective: 'venta', language: 'es', block: { key: 'hero', type: 'encabezado', content: { title: 'Aprende datos', subtitle: 'Un curso' } }, instruction: 'hazlo más directo y breve' },
    )) as { content?: unknown };
    expect(validateBlockContent('encabezado', proposal.content)).toEqual([]);
    console.log('BLOQUE REESCRITO:', JSON.stringify(proposal.content));
  }, 150_000);
});
