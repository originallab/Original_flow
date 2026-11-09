import type { Template } from '../catalog';

/**
 * Miniatura de una plantilla (como en la biblioteca del mockup). Usa los colores del cliente de
 * ejemplo de cada plantilla, por eso van como estilos en línea y no como tokens de la plataforma.
 */
export function TemplateThumb({ template }: { template: Pick<Template, 'background' | 'accent'> }) {
  return (
    <div aria-hidden className="rounded-lg bg-chip p-2.5">
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <div className="flex gap-1 px-2 py-1.5">
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="size-1 rounded-full bg-border-strong" />
          ))}
        </div>
        <div className="space-y-1.5 px-3 py-3" style={{ background: template.background }}>
          <div className="h-1.5 w-4/5 rounded bg-[#1b1b1f]" />
          <div className="h-1.5 w-3/5 rounded bg-[#1b1b1f]" />
          <div className="h-1 w-2/5 rounded bg-[#8d8a85]" />
          <div className="mt-2 h-2.5 w-10 rounded" style={{ background: template.accent }} />
        </div>
        <div className="grid grid-cols-3 gap-1 p-2">
          {[1, 0.6, 0.35].map((opacity) => (
            <div key={opacity} className="flex h-4 items-center justify-center rounded bg-surface-2">
              <span className="size-1.5 rounded-full" style={{ background: template.accent, opacity }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
