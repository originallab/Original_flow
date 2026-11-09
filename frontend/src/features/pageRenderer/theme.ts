import type { CSSProperties } from 'react';
import { templateOf } from '@/features/funnels/catalog';
import type { BrandPalette } from '@/services/workspaces';
import type { DesignSpec, TemplateId } from '@/shared/blocks/types';

/**
 * Cómo se ve cada plantilla además de sus colores. Es una primera aproximación: las seis
 * plantillas se afinan (tipografías, estructura) cuando llegue la pieza de las páginas públicas.
 */
interface TemplateLook {
  /** Esquinas de tarjetas y botones. */
  radius: string;
  /** Alineación del encabezado. */
  align: 'left' | 'center';
  headingWeight: number;
  headingTransform: CSSProperties['textTransform'];
}

const LOOKS: Record<TemplateId, TemplateLook> = {
  claridad: { radius: '14px', align: 'left', headingWeight: 700, headingTransform: 'none' },
  impacto: { radius: '2px', align: 'left', headingWeight: 800, headingTransform: 'uppercase' },
  minimal: { radius: '0px', align: 'left', headingWeight: 500, headingTransform: 'none' },
  encuentro: { radius: '20px', align: 'center', headingWeight: 700, headingTransform: 'none' },
  recurso: { radius: '10px', align: 'center', headingWeight: 700, headingTransform: 'none' },
  agenda: { radius: '999px', align: 'left', headingWeight: 600, headingTransform: 'none' },
};

export interface PageTheme {
  palette: BrandPalette;
  look: TemplateLook;
  template: TemplateId;
}

/** La paleta y el estilo de una página: lo que dice su diseño, o los de la plantilla por defecto. */
export function resolveTheme(design: DesignSpec | null | undefined): PageTheme {
  const template = design?.template ?? 'claridad';
  return { template, palette: design?.palette ?? templateOf(template).palette, look: LOOKS[template] };
}

/** Un color de la página con el que se ve bien el texto encima (blanco o el texto de la paleta). */
export function readableOn(background: string, palette: BrandPalette): string {
  const value = Number.parseInt(background.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? palette.text : '#FFFFFF';
}
