import type { FunnelObjective } from '../generated/prisma/client.js';
import { getFunnelType } from './index.js';

/** Lo que la página muestra o hace después de que el visitante envía el formulario. */
export interface AfterSubmit {
  message?: string;
  /** A dónde mandar a la persona (agradecimiento, calendario...). */
  redirectUrl?: string;
  /** Recurso a descargar (magnet): id del archivo en Media-as-a-Service. */
  resourceFileId?: string;
  /** Enlace para entrar al evento (webinar). */
  joinUrl?: string;
  startsAt?: string;
  timezone?: string;
}

/**
 * Convierte el `typeConfig` del funnel en lo que ve quien se registra. Estos datos NO viajan
 * en la página pública (el enlace de una reunión o el recurso de un magnet son para quien ya
 * se registró), por eso solo salen en la respuesta al enviar el formulario.
 * Devuelve null si el tipo no tiene pantalla posterior o si la configuración no es válida.
 */
export function buildAfterSubmit(objective: FunnelObjective, rawTypeConfig: unknown): AfterSubmit | null {
  const parsed = getFunnelType(objective).typeConfigSchema.safeParse(rawTypeConfig);
  if (!parsed.success) return null;
  const c = parsed.data as Record<string, any>;

  switch (objective) {
    case 'leads':
      return { message: c.thankYou.message, redirectUrl: c.thankYou.redirectUrl };
    case 'citas':
      return { message: c.confirmationMessage, redirectUrl: c.calendarUrl };
    case 'magnet':
      return { message: c.deliveryMessage, resourceFileId: c.resourceFileId };
    case 'webinar':
      return { joinUrl: c.joinUrl, startsAt: c.startsAt, timezone: c.timezone };
    case 'aplicacion':
      return { message: c.successMessage };
    default:
      return null;
  }
}
