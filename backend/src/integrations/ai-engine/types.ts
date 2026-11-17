import type { BlockType } from '../../funnel-types/blocks.js';
import type { FunnelObjective } from '../../generated/prisma/client.js';

/**
 * ESQUELETO: este es el contrato que Original Flow NECESITA del motor de IA, no el contrato del servicio
 * (todavía no lo tenemos: falta la documentación de Original AI Engine). Cuando llegue, solo cambia la
 * implementación real en `client.ts`; el servicio y las rutas no se tocan. Lo que devuelve el motor es
 * `unknown` a propósito: el servicio lo valida con los esquemas de los bloques antes de usarlo.
 */

/** Qué se le pidió al motor y para qué negocio: va en cada llamada para desglosar el costo por cliente. */
export interface AiContext {
  requestId: string;
  workspaceId: string;
  action: 'generate_page' | 'regenerate_block';
}

/** Lo que el motor necesita saber de la marca para escribir la página. */
export interface AiBrandBrief {
  name?: string;
  industry?: string;
  tone?: string;
  description?: string;
}

export interface GeneratePageInput {
  objective: FunnelObjective;
  language: string;
  name: string;
  productName?: string;
  targetAudience?: string;
  /** Lo que la persona escribió en el asistente: el motor no debe salirse de esto. */
  brandBrief?: AiBrandBrief;
  /** Todos los tipos de bloque que puede usar. */
  blockTypes: readonly BlockType[];
  /** Los bloques con los que arranca este tipo de funnel (el esqueleto sugerido). */
  baseBlocks: readonly BlockType[];
  instruction?: string;
}

export interface RegenerateBlockInput {
  objective: FunnelObjective;
  language: string;
  brandBrief?: AiBrandBrief;
  block: { key: string; type: BlockType; content: Record<string, unknown> };
  instruction?: string;
}

/**
 * El motor de IA. Cada método devuelve la propuesta sin validar (`unknown`); si el servicio no responde,
 * lanza `AppError.serviceUnavailable`. Implementaciones: la real (pendiente del contrato) y la que
 * responde «no disponible» mientras no haya credenciales.
 */
export interface AiEngine {
  generatePage(ctx: AiContext, input: GeneratePageInput): Promise<unknown>;
  regenerateBlock(ctx: AiContext, input: RegenerateBlockInput): Promise<unknown>;
}
