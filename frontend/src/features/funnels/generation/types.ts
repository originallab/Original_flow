import type { Funnel, FunnelObjective } from '@/services/funnels';
import type { Workspace } from '@/services/workspaces';
import type { Block, DesignSpec, TemplateId } from '@/shared/blocks/types';
import type { Brief } from '../catalog';

/** Todo lo que la persona eligió y escribió en el asistente. */
export interface GenerationInput {
  workspace: Workspace;
  objective: FunnelObjective;
  /** Las instrucciones para la IA (producto, público, tono…). */
  brief: Brief;
  templateId: TemplateId;
}

/** La página que arma un generador: su diseño y sus bloques. */
export interface GeneratedPage {
  designSpec: DesignSpec;
  blocks: Block[];
  /** `true`: el generador ya la guardó en el servidor (como hará la IA) y no hace falta volver a guardarla. */
  persisted?: boolean;
}

export interface GenerationContext {
  /** El funnel en borrador al que pertenece la página. */
  funnel: Funnel;
  token: string;
}

/**
 * Quien arma la primera versión de la página a partir de lo que dijo la persona. Hoy lo hace
 * `templateGenerator` (la plantilla elegida + sus textos); más adelante, un generador con IA que
 * llame a `POST /funnels/:id/generate` (Original AI Engine) y devuelva el mismo `GeneratedPage`.
 * El asistente y el editor no saben cuál de los dos se usó.
 */
export interface PageGenerator {
  readonly id: string;
  generate(input: GenerationInput, context: GenerationContext): Promise<GeneratedPage>;
}

export type { TemplateId };
