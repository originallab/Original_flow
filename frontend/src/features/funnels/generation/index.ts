import { createFunnel, saveContent, saveDesignSpec, saveTypeConfig, type Funnel } from '@/services/funnels';
import { isDemoMode } from '@/services/demo';
import { FUNNEL_TYPES, validateTypeConfig } from '@/shared/funnelTypes';
import { createAiGenerator } from './aiGenerator';
import { toNewFunnel } from './briefToFunnel';
import { templateGenerator } from './templateGenerator';
import type { GenerationInput, PageGenerator } from './types';

export type { GeneratedPage, GenerationContext, GenerationInput, PageGenerator } from './types';

const aiGenerator = createAiGenerator(templateGenerator);

/**
 * El generador que usa el asistente: la IA (`POST /funnels/:id/generate`), con la plantilla como respaldo si el
 * servidor no tiene IA disponible. En el modo demostración (solo en desarrollo, sin servidor) siempre la plantilla.
 * Se decide en cada llamada, no al cargar el módulo.
 */
export const pageGenerator: PageGenerator = {
  id: 'auto',
  generate: (input, context) => (import.meta.env.DEV && isDemoMode() ? templateGenerator : aiGenerator).generate(input, context),
};

/** Paso 1: crea el funnel en borrador con los datos del asistente. */
export function createDraft(token: string, input: GenerationInput): Promise<Funnel> {
  return createFunnel(token, toNewFunnel(input));
}

/**
 * Paso 2: arma la página con el generador y la guarda en el funnel (diseño y contenido). Si el
 * generador ya la guardó por su cuenta (`persisted`), no se vuelve a guardar. En cualquier caso deja los
 * ajustes del tipo de funnel con sus valores de partida cuando estos ya están completos (leads, venta y
 * aplicación): la IA escribe la página, pero no conoce esos ajustes (por ejemplo, los métodos de pago y el
 * mensaje de éxito de una venta). Los demás tipos piden datos que solo la persona sabe (un enlace, un
 * archivo) y los completa en el editor. Se puede repetir sobre el mismo borrador si algo falla, sin crear otro funnel.
 */
export async function fillDraft(token: string, funnel: Funnel, input: GenerationInput, generator: PageGenerator = pageGenerator): Promise<void> {
  const page = await generator.generate(input, { funnel, token });
  if (!page.persisted) {
    await saveDesignSpec(token, funnel.id, page.designSpec);
    await saveContent(token, funnel.id, page.blocks);
  }
  const initial = FUNNEL_TYPES[input.objective].initial();
  if (validateTypeConfig(input.objective, initial).length === 0) await saveTypeConfig(token, funnel.id, initial);
}
