import { createFunnel, saveContent, saveDesignSpec, type Funnel } from '@/services/funnels';
import { toNewFunnel } from './briefToFunnel';
import { templateGenerator } from './templateGenerator';
import type { GenerationInput, PageGenerator } from './types';

export type { GeneratedPage, GenerationContext, GenerationInput, PageGenerator } from './types';

/**
 * El generador que usa el asistente. Hoy arma la página con la plantilla; para usar la IA basta
 * con cambiar esto por un generador que cumpla `PageGenerator` (ver types.ts).
 */
export const pageGenerator: PageGenerator = templateGenerator;

/** Paso 1: crea el funnel en borrador con los datos del asistente. */
export function createDraft(token: string, input: GenerationInput): Promise<Funnel> {
  return createFunnel(token, toNewFunnel(input));
}

/**
 * Paso 2: arma la página con el generador y la guarda en el funnel (diseño y contenido). Si el
 * generador ya la guardó por su cuenta (`persisted`), no se vuelve a guardar. Se puede repetir sobre
 * el mismo borrador si algo falla, sin crear otro funnel.
 */
export async function fillDraft(token: string, funnel: Funnel, input: GenerationInput, generator: PageGenerator = pageGenerator): Promise<void> {
  const page = await generator.generate(input, { funnel, token });
  if (page.persisted) return;
  await saveDesignSpec(token, funnel.id, page.designSpec);
  await saveContent(token, funnel.id, page.blocks);
}
