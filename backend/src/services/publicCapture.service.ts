import type { Prisma } from '../generated/prisma/client.js';
import { buildAfterSubmit, type AfterSubmit } from '../funnel-types/afterSubmit.js';
import { AppError } from '../lib/errors.js';
import { SLUG_PATTERN } from '../lib/slug.js';
import type { EventModel } from '../models/event.model.js';
import type { FunnelModel } from '../models/funnel.model.js';
import type { LeadModel } from '../models/lead.model.js';
import type { EventsBody, LeadBody } from '../schemas/public.schemas.js';

interface Deps {
  funnels: FunnelModel;
  leads: LeadModel;
  events: EventModel;
}

/**
 * Captura pública: leads y eventos de una página publicada. No lleva sesión; el funnel se
 * identifica por su slug. Los datos del visitante se guardan en la base de datos pero nunca
 * se escriben en los logs ni en el registro de auditoría (datos personales).
 */
export function createPublicCaptureService({ funnels, leads, events }: Deps) {
  /** Solo los funnels publicados reciben datos; para cualquier otro, el mismo 404. */
  async function publishedFunnel(slug: string) {
    const funnel = SLUG_PATTERN.test(slug) ? await funnels.findPublishedForCapture(slug) : null;
    if (!funnel) throw AppError.notFound('PAGE_NOT_FOUND', 'Página no encontrada');
    return funnel;
  }

  return {
    /**
     * POST /public/funnels/:slug/leads: guarda el lead en la primera etapa del workspace y
     * registra `lead_created`. Devuelve lo que la página muestra después (agradecimiento,
     * calendario, recurso...), que no viaja antes en la página pública.
     */
    async captureLead(slug: string, body: LeadBody): Promise<{ ok: true; next: AfterSubmit | null }> {
      const funnel = await publishedFunnel(slug);

      const leadStageId = await leads.firstStageId(funnel.workspaceId);
      if (!leadStageId) {
        throw AppError.unprocessable('PIPELINE_NOT_CONFIGURED', 'El negocio todavía no tiene etapas de seguimiento configuradas');
      }

      await leads.createWithEvent(
        {
          funnelId: funnel.id,
          leadStageId,
          name: body.name,
          email: body.email,
          phone: body.phone,
          utm: body.utm,
          // `_consentAt` es de uso interno: el esquema no deja que el visitante envíe claves con guion bajo inicial.
          customFields: { ...body.customFields, _consentAt: new Date().toISOString() },
        },
        // El origen del lead alimenta "de dónde vienen los clics" del dashboard.
        body.utm.utm_source ? { source: body.utm.utm_source } : {},
      );
      return { ok: true, next: buildAfterSubmit(funnel.objective, funnel.typeConfig) };
    },

    /** POST /public/funnels/:slug/events: visitas, clics y secciones vistas, en lote. */
    async recordEvents(slug: string, body: EventsBody): Promise<{ accepted: number }> {
      const funnel = await publishedFunnel(slug);
      await events.createMany(
        funnel.id,
        body.events.map((e) => ({ type: e.type, properties: e.properties as Prisma.InputJsonValue })),
      );
      return { accepted: body.events.length };
    },
  };
}

export type PublicCaptureService = ReturnType<typeof createPublicCaptureService>;
