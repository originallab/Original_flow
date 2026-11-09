import type { BrandPalette } from '@/services/workspaces';

/**
 * Cómo se verá una landing con esta paleta. Usa los colores del CLIENTE (no los de la plataforma),
 * por eso van como estilos en línea y no como tokens de Original Flow.
 */
export function BrandPreview({ palette, name, logoSrc }: { palette: BrandPalette; name: string; logoSrc?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Así se verá en tus landing pages</p>
      <div className="mt-2 overflow-hidden rounded-xl border border-border" aria-label="Vista previa de la marca">
        <div className="flex items-center justify-between px-5 py-3" style={{ background: palette.background, color: palette.text }}>
          {logoSrc ? (
            <img src={logoSrc} alt={`Logo de ${name || 'tu negocio'}`} className="h-6 max-w-36 object-contain object-left" />
          ) : (
            <span className="text-sm font-semibold">{name || 'Tu negocio'}</span>
          )}
          <span className="rounded-md px-3 py-1 text-xs font-semibold" style={{ background: palette.primary, color: palette.background }}>
            Reservar mi lugar
          </span>
        </div>
        <div className="grid gap-4 px-5 pb-5 pt-2 sm:grid-cols-[1.4fr_1fr]" style={{ background: palette.background, color: palette.text }}>
          <div>
            <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ background: palette.accent, color: palette.text }}>
              Nuevo
            </span>
            <p className="mt-2 text-lg font-bold leading-snug">Titular de tu página con la marca de tu negocio</p>
            <p className="mt-1 text-xs opacity-80">Así se combinan los colores de tu paleta en una landing publicada.</p>
          </div>
          <div className="rounded-lg p-4 text-sm font-semibold" style={{ background: palette.secondary, color: palette.background }}>
            Un destacado
            <span className="mt-1 block text-xs font-normal opacity-90">con el color secundario.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
