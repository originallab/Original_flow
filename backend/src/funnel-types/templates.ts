/**
 * Plantillas de página disponibles (catálogo fijo del producto, no una tabla). Cada funnel
 * guarda la que usa en `designSpec.template`; el front las dibuja y el backend solo valida el nombre.
 */
export const TEMPLATES = ['claridad', 'impacto', 'minimal', 'encuentro', 'recurso', 'agenda'] as const;
export type TemplateId = (typeof TEMPLATES)[number];
