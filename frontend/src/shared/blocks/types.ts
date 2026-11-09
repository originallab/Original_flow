import type { BrandPalette } from '@/services/workspaces';

/**
 * El modelo de una página, con la misma forma que el backend (docs/API_MVP.md → Funnels):
 * una lista de bloques y un «diseño» (plantilla, paleta y tipografías). Lo comparten el editor,
 * el renderizador de páginas, el generador y el modo demostración.
 */
export const BLOCK_TYPES = [
  'encabezado',
  'texto',
  'imagen',
  'video',
  'formulario',
  'boton',
  'contador',
  'precios',
  'testimonios',
  'faq',
  'logos',
  'beneficios',
  'calendario',
  'agenda',
  'requisitos',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface Block {
  /** Identificador estable dentro de la página (minúsculas, números, `-` y `_`). */
  key: string;
  type: BlockType;
  /** Posición, empezando en 1. */
  order: number;
  content: Record<string, unknown>;
  style: Record<string, unknown>;
}

export const TEMPLATE_IDS = ['claridad', 'impacto', 'minimal', 'encuentro', 'recurso', 'agenda'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface DesignSpec {
  template: TemplateId;
  /** Si falta, la plantilla usa su paleta propia. */
  palette?: BrandPalette;
  fonts?: { heading: string; body: string };
}

/** Un problema de validación: dónde está (`['items', 0, 'title']`) y qué pasa. */
export interface Issue {
  path: (string | number)[];
  message: string;
}

export const MAX_BLOCKS = 60;
