import type { BlockType } from '../../funnel-types/blocks.js';
import type { CreativeBrief } from '../../funnel-types/creative.js';
import type { FunnelObjective } from '../../generated/prisma/client.js';

/**
 * Lo que Original Flow necesita del motor de IA. La implementación real (`client.ts`) habla con IA Engine, un
 * gateway de modelos de lenguaje: no tiene endpoints de «generar página», así que las instrucciones al modelo
 * (`prompts.ts`) las armamos nosotros. Hay otra implementación que responde «no disponible» (`unavailable.ts`). Lo que devuelve el motor es
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

/** Lo que la persona contó en el asistente: el resultado que promete, las dudas de su público, el tono... */
export interface AiPageDetails {
  result?: string;
  objections?: string;
  tone?: string;
  callToAction?: string;
  extra?: string;
}

export interface GeneratePageInput {
  objective: FunnelObjective;
  language: string;
  name: string;
  productName?: string;
  targetAudience?: string;
  /** El precio y la divisa del funnel, si tiene: la IA no debe inventar otros. */
  price?: number;
  currency?: string;
  /** Lo que la persona escribió en el asistente: el motor no debe salirse de esto. */
  brandBrief?: AiBrandBrief;
  /** El logo del negocio, si tiene: la página puede mostrarlo (con esta dirección exacta). */
  logoUrl?: string;
  /** Las imágenes que la persona subió para esta página: la IA solo puede usar estas direcciones. */
  images?: { url: string; name: string }[];
  /** La paleta de la marca del negocio, si la tiene: la página debe usarla tal cual. */
  brandPalette?: { primary: string; secondary: string; accent: string; background: string; text: string };
  /** El punto de partida creativo de esta página (estructura, estética y color), distinto en cada generación. */
  creative?: CreativeBrief;
  /** Resumen del diseño de otras páginas del negocio: la nueva no debe parecerse. */
  avoid?: string[];
  /** Ejemplos de diseños bien resueltos, solo para fijar el nivel de calidad. */
  examples?: { fonts: { heading: string; body: string }; look: unknown; palette: unknown }[];
  /** El diseño que la página ya tiene (al volver a generar): se conserva, la IA solo reescribe los bloques. */
  keepDesign?: { template?: string; fonts?: { heading: string; body: string }; look?: unknown; palette?: unknown };
  /** El resto de lo que escribió en el asistente. */
  details?: AiPageDetails;
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
