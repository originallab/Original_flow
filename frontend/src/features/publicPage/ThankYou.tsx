import { CalendarDays, Check, Download, Video } from 'lucide-react';
import { useEffect } from 'react';
import { PublicButtonLink } from '@/features/pageRenderer/public';
import { readableOn, type PageTheme } from '@/features/pageRenderer/theme';
import type { PublicPage } from '@/services/publicPages';
import type { AfterSubmit } from '@/shared/afterSubmit';
import { navigation } from '@/shared/utils/navigation';
import { safeHttpUrl } from '@/shared/utils/safeUrl';
import { REDIRECT_DELAY_MS } from './constants';

function formatStart(startsAt: string, timezone?: string): string | null {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'short' };
  try {
    return new Intl.DateTimeFormat('es', { ...options, ...(timezone ? { timeZone: timezone } : {}) }).format(date);
  } catch {
    // Una zona horaria que el navegador no conoce: se muestra en la hora de la persona.
    return new Intl.DateTimeFormat('es', options).format(date);
  }
}

/**
 * La pantalla de después de registrarse (`next` de la respuesta del lead): agradece y, según el tipo de
 * funnel, lleva al siguiente paso (agenda una cita, entrega el recurso, da el enlace al evento…).
 */
export function ThankYou({ page, next, theme }: { page: PublicPage; next: AfterSubmit | null; theme: PageTheme }) {
  const redirectUrl = page.objective === 'leads' ? safeHttpUrl(next?.redirectUrl) : null;
  const calendarUrl = page.objective === 'citas' ? safeHttpUrl(next?.redirectUrl) : null;
  const joinUrl = safeHttpUrl(next?.joinUrl);
  const when = next?.startsAt ? formatStart(next.startsAt, next.timezone) : null;

  useEffect(() => {
    if (!redirectUrl) return;
    const timer = setTimeout(() => navigation.to(redirectUrl), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [redirectUrl]);

  const title = page.objective === 'webinar' ? '¡Ya estás registrado!' : '¡Gracias!';
  const message = next?.message ?? (page.objective === 'webinar' ? 'Guarda la fecha y entra con el enlace de abajo.' : 'Recibimos tus datos.');

  return (
    <div className="grid min-h-screen place-items-center px-6 py-12" style={{ background: theme.palette.background, color: theme.palette.text }}>
      <main role="status" aria-live="polite" className="w-full max-w-md text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full" style={{ background: theme.palette.accent, color: readableOn(theme.palette.accent, theme.palette) }}>
          <Check size={26} aria-hidden />
        </span>
        <h1 className="mt-5 text-3xl font-heading leading-tight" style={{ fontWeight: theme.look.headingWeight, textTransform: theme.look.headingTransform }}>
          {title}
        </h1>
        <p className="mt-3 whitespace-pre-line text-base opacity-90">{message}</p>

        {when && (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm font-medium">
            <CalendarDays size={16} aria-hidden /> {when}
            {next?.timezone ? <span className="opacity-70">({next.timezone})</span> : null}
          </p>
        )}

        <div className="mt-6 flex flex-col items-center gap-3">
          {calendarUrl && (
            <PublicButtonLink theme={theme} href={calendarUrl}>
              Elegir mi horario
            </PublicButtonLink>
          )}
          {joinUrl && (
            <PublicButtonLink theme={theme} href={joinUrl}>
              <Video size={16} className="mr-2 inline align-text-bottom" aria-hidden />
              Entrar al evento
            </PublicButtonLink>
          )}
          {next?.resourceFileId && (
            <>
              <button type="button" disabled title="La descarga todavía no está disponible" className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold opacity-60" style={{ background: theme.palette.primary, color: readableOn(theme.palette.primary, theme.palette), borderRadius: theme.look.radius }}>
                <Download size={16} aria-hidden /> Descargar recurso
              </button>
              <p className="text-xs opacity-70">La descarga todavía no está disponible.</p>
            </>
          )}
          {redirectUrl && (
            <>
              <p className="text-sm opacity-70">Te llevamos al siguiente paso en unos segundos…</p>
              <a href={redirectUrl} rel="noopener noreferrer" className="text-sm font-semibold underline" style={{ color: theme.palette.primary }}>
                Continuar ahora
              </a>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
