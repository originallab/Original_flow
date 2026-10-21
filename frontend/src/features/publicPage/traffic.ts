import type { Utm } from '@/shared/leads';

/** De dónde llegó la visita: el parámetro `utm_source` si lo trae, o el sitio desde el que llegó. `undefined` si no se sabe. */
export function trafficSource(search: string, referrer: string, ownHost: string): string | undefined {
  const fromUtm = new URLSearchParams(search).get('utm_source')?.trim();
  if (fromUtm) return fromUtm.slice(0, 100);
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (host && host !== ownHost) return host.slice(0, 100);
    } catch {
      // Un referente que no es una dirección válida no se usa.
    }
  }
  return undefined;
}

/** Los parámetros UTM de la dirección (solo los permitidos) y el referente, listos para mandarse con el lead. */
export function readUtm(search: string, referrer: string): Utm {
  const params = new URLSearchParams(search);
  const utm: Utm = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
    const value = params.get(key)?.trim();
    if (value) utm[key] = value.slice(0, 100);
  }
  if (referrer.trim()) utm.referrer = referrer.trim().slice(0, 300);
  return utm;
}
