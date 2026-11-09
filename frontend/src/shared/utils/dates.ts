/** Cómo se escribe una fecha en pantalla: relativa («hace 5 minutos», «ayer») y completa. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const dateOnly = new Intl.DateTimeFormat('es', { dateStyle: 'medium' });
const dateTime = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeStyle: 'short' });

/** «hace 5 minutos», «ayer», «hace 3 días»; pasada una semana, la fecha. */
export function relativeDate(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const diff = now - time;
  if (diff < MINUTE) return 'hace un momento';
  if (diff < HOUR) return relative.format(-Math.floor(diff / MINUTE), 'minute');
  if (diff < DAY) return relative.format(-Math.floor(diff / HOUR), 'hour');
  if (diff < 7 * DAY) return relative.format(-Math.floor(diff / DAY), 'day');
  return dateOnly.format(time);
}

export const fullDate = (iso: string): string => (Number.isNaN(Date.parse(iso)) ? '' : dateTime.format(Date.parse(iso)));
