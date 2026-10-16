import { AppError } from '../lib/errors.js';
import { SLUG_PATTERN } from '../lib/slug.js';
import type { FunnelModel } from '../models/funnel.model.js';

/**
 * Página pública de un funnel publicado. No necesita sesión: la ve el visitante. Solo expone
 * lo necesario para dibujarla; los enlaces de typeConfig (reunión de un webinar, recurso de un
 * magnet) no salen aquí porque son para quien ya se registró.
 */
export function createPublicPageService(funnels: FunnelModel) {
  return {
    async getPage(slug: string) {
      // Un slug mal formado no puede existir: se responde igual que uno inexistente.
      const funnel = SLUG_PATTERN.test(slug) ? await funnels.findPublishedBySlug(slug) : null;
      if (!funnel) throw AppError.notFound('PAGE_NOT_FOUND', 'Página no encontrada');
      return { ...funnel, price: funnel.price ? funnel.price.toNumber() : null };
    },
  };
}

export type PublicPageService = ReturnType<typeof createPublicPageService>;
