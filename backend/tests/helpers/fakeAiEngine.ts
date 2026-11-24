import { AppError } from '../../src/lib/errors.js';
import type { AiContext, AiEngine, GeneratePageInput, RegenerateBlockInput } from '../../src/integrations/ai-engine/types.js';

/**
 * Motor de IA de mentira para las pruebas del esqueleto. Devuelve lo que se le indique (por defecto, una página
 * válida) y registra cada llamada. NO reproduce el contrato de Original AI Engine (todavía no se tiene): solo
 * ejerce el servicio de generación y sus validaciones.
 */
export const VALID_PAGE = {
  designSpec: { template: 'claridad', palette: { primary: '#0E7A63', secondary: '#1B4D3E', accent: '#F4A261', background: '#FFFFFF', text: '#1A1A1A' } },
  seo: { title: 'Curso de datos', description: 'Aprende datos desde cero' },
  blocks: [
    { key: 'hero', type: 'encabezado', order: 1, content: { title: 'Aprende datos', subtitle: 'En 4 semanas' }, style: {} },
    { key: 'detalle', type: 'texto', order: 2, content: { title: 'Qué incluye', body: 'Clases en vivo y ejercicios.' }, style: {} },
    { key: 'cta', type: 'boton', order: 3, content: { label: 'Quiero entrar' }, style: {} },
  ],
};

export function createFakeAiEngine() {
  const calls: { action: AiContext['action']; ctx: AiContext; input: GeneratePageInput | RegenerateBlockInput }[] = [];
  let page: unknown = VALID_PAGE;
  let block: unknown = { content: { title: 'Un título nuevo', subtitle: 'Un subtítulo nuevo' } };
  let failure: Error | null = null;
  /** Respuestas que se dan primero, una por llamada, antes de la normal. */
  const queue: unknown[] = [];

  const run = async <T>(action: AiContext['action'], ctx: AiContext, input: GeneratePageInput | RegenerateBlockInput, result: T): Promise<T> => {
    calls.push({ action, ctx, input });
    if (failure) throw failure;
    return result;
  };

  const engine: AiEngine = {
    generatePage: (ctx, input) => run('generate_page', ctx, input, queue.length > 0 ? queue.shift() : page),
    regenerateBlock: (ctx, input) => run('regenerate_block', ctx, input, block),
  };

  return {
    engine,
    calls,
    respondPage: (value: unknown) => void (page = value),
    /** La próxima llamada (solo esa) responde esto; las siguientes vuelven a la normal. */
    respondOnce: (value: unknown) => void queue.push(value),
    respondBlock: (value: unknown) => void (block = value),
    /** La próxima y siguientes llamadas lanzan este error (null lo quita). */
    failWith: (error: Error | null) => void (failure = error),
    unavailable: () => void (failure = AppError.serviceUnavailable('AI_UNAVAILABLE', 'sin servicio')),
    reset: () => {
      calls.length = 0;
      queue.length = 0;
      page = VALID_PAGE;
      block = { content: { title: 'Un título nuevo', subtitle: 'Un subtítulo nuevo' } };
      failure = null;
    },
  };
}

export type FakeAiEngine = ReturnType<typeof createFakeAiEngine>;
