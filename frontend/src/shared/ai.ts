import { ApiError } from '@/services/api';
import { BLOCKS } from '@/shared/blocks/catalog';
import type { BlockType } from '@/shared/blocks/types';

/** Un mensaje claro para la persona según lo que respondió el servidor al pedir algo a la IA. */
export function aiErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'No se pudo usar la IA. Intenta de nuevo.';
  switch (err.code) {
    case 'AI_NOT_CONFIGURED':
    case 'AI_MISCONFIGURED':
      return 'La IA no está disponible por ahora.';
    case 'AI_UNAVAILABLE':
    case 'SERVER_UNAVAILABLE':
      return 'La IA no respondió. Intenta de nuevo en un momento.';
    case 'AI_BAD_RESPONSE':
      return 'La IA no devolvió algo que se pueda usar. Intenta de nuevo.';
    case 'AI_RATE_LIMITED':
      return 'Se alcanzó el límite de usos de la IA de este negocio. Intenta más tarde.';
    case 'AI_QUOTA_EXCEEDED':
      return 'Se agotó la cuota de la IA. Intenta más tarde.';
    case 'FUNNEL_PUBLISHED':
      return 'Despublica el funnel antes de volver a generar su página.';
    case 'AI_BLOCK_NOT_SUPPORTED':
      return 'La IA no puede reescribir este tipo de bloque.';
    default:
      return err.status === 0 ? err.message : 'No se pudo usar la IA. Intenta de nuevo.';
  }
}

export interface ContentLine {
  label: string;
  text: string;
}

const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : typeof value === 'number' ? String(value) : null);

/**
 * El texto de un bloque en líneas legibles, para mostrar una propuesta de la IA sin dibujar el bloque: cada campo con su
 * etiqueta; las listas (beneficios, preguntas, planes…) con una línea por elemento.
 */
export function describeContent(type: BlockType, content: Record<string, unknown>): ContentLine[] {
  const labels = new Map(BLOCKS[type].fields.map((field) => [field.key, field.label]));
  const lines: ContentLine[] = [];
  for (const [key, value] of Object.entries(content)) {
    const label = labels.get(key) ?? key;
    const text = asText(value);
    if (text) {
      lines.push({ label, text });
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const parts = typeof item === 'object' && item !== null ? Object.values(item as Record<string, unknown>).map(asText).filter((part): part is string => part !== null) : [asText(item)].filter((part): part is string => part !== null);
        if (parts.length > 0) lines.push({ label: `${label} ${index + 1}`, text: parts.join(' — ') });
      });
    }
  }
  return lines;
}
