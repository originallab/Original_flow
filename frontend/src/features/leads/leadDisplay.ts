import type { Lead } from '@/services/leads';

/** Cómo se muestra un lead en el tablero y en su detalle (todo viene de lo que escribió quien llenó el formulario: nunca se usa como HTML). */

// Más estricto que el del formulario: un correo con `?`, `&`, `%` o similares podría precargar destinatarios o texto al abrir el enlace.
const LINKABLE_EMAIL = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PHONE = /^[0-9+()\-.\s]{6,30}$/;

/** El nombre del lead; si no dejó nombre, su correo o su teléfono. */
export function leadTitle(lead: Lead): string {
  return lead.name?.trim() || lead.email?.trim() || lead.phone?.trim() || 'Sin nombre';
}

/** Los datos de contacto que no son el título (para no repetirlos). */
export function leadContact(lead: Lead): string[] {
  const title = leadTitle(lead);
  return [lead.email, lead.phone].map((value) => value?.trim()).filter((value): value is string => Boolean(value) && value !== title);
}

/** Datos que sí se pueden convertir en enlace (`mailto:` y `tel:`): solo los que tienen la forma esperada; los demás se muestran como texto. */
export const mailtoOf = (email: string | null) => (email && LINKABLE_EMAIL.test(email.trim()) ? `mailto:${email.trim()}` : null);
export const telOf = (phone: string | null) => (phone && PHONE.test(phone.trim()) ? `tel:${phone.trim().replace(/\s+/g, '')}` : null);

/** De dónde llegó: la fuente de la campaña, el sitio de donde vino o «Directo». */
export function originOf(lead: Lead): string {
  const source = lead.utm?.utm_source?.trim();
  if (source) return source;
  const referrer = lead.utm?.referrer?.trim();
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (host) return host;
    } catch {
      // Un referente que no es una dirección válida no cuenta.
    }
  }
  return 'Directo';
}

export { fullDate, relativeDate } from '@/shared/utils/dates';

const number = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });
/** El valor estimado. No lleva símbolo: el lead no guarda en qué divisa está. */
export const formatValue = (value: number): string => number.format(value);

/** Lo que dejó escrito en el formulario, sin los campos internos (los que empiezan con guion bajo) ni los vacíos. */
export function visibleCustomFields(lead: Lead): { label: string; value: string }[] {
  return Object.entries(lead.customFields ?? {})
    .filter(([key, value]) => !key.startsWith('_') && value !== null && String(value).trim() !== '')
    .map(([key, value]) => {
      const spaced = key.replace(/_/g, ' ');
      return { label: spaced.charAt(0).toUpperCase() + spaced.slice(1), value: typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value) };
    });
}
