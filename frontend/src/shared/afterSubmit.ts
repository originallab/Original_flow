import type { FunnelObjective } from '@/services/funnels';
import { validateTypeConfig } from './funnelTypes';

/** Lo que la página muestra o hace después de que el visitante envía el formulario (`next` en la respuesta del lead). */
export interface AfterSubmit {
  message?: string;
  /** A dónde mandar a la persona (agradecimiento, calendario…). */
  redirectUrl?: string;
  /** Recurso a descargar (magnet): id del archivo en Media-as-a-Service. */
  resourceFileId?: string;
  /** Enlace para entrar al evento (webinar). */
  joinUrl?: string;
  startsAt?: string;
  timezone?: string;
}

const clean = (value: AfterSubmit): AfterSubmit => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as AfterSubmit;

/**
 * Convierte los ajustes del tipo de funnel en lo que ve quien se registra (igual que `buildAfterSubmit`
 * del backend). Estos datos NO viajan en la página pública: el enlace de una reunión o el recurso de un
 * magnet son para quien ya se registró. Devuelve `null` si el tipo no tiene pantalla posterior o si los
 * ajustes no son válidos.
 */
export function afterSubmitFor(objective: FunnelObjective, typeConfig: unknown): AfterSubmit | null {
  if (validateTypeConfig(objective, typeConfig).length > 0) return null;
  const c = typeConfig as Record<string, any>;
  switch (objective) {
    case 'leads':
      return clean({ message: c.thankYou.message, redirectUrl: c.thankYou.redirectUrl });
    case 'citas':
      return clean({ message: c.confirmationMessage, redirectUrl: c.calendarUrl });
    case 'magnet':
      return clean({ message: c.deliveryMessage, resourceFileId: c.resourceFileId });
    case 'webinar':
      return clean({ joinUrl: c.joinUrl, startsAt: c.startsAt, timezone: c.timezone });
    case 'aplicacion':
      return clean({ message: c.successMessage });
    default:
      return null;
  }
}
