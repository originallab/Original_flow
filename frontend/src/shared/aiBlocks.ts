import type { BlockType } from '@/shared/blocks/types';

/**
 * Los bloques que la IA puede reescribir (los mismos que valida el backend). Quedan fuera los que necesitan datos
 * que no debe inventar: testimonios, logos, imágenes, videos, calendario y cuenta regresiva.
 */
export const AI_BLOCK_TYPES: readonly BlockType[] = ['encabezado', 'texto', 'beneficios', 'faq', 'precios', 'formulario', 'boton', 'agenda', 'requisitos'];

export const canRewriteWithAi = (type: BlockType): boolean => AI_BLOCK_TYPES.includes(type);
