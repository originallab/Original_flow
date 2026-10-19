import { Logo } from '@/shared/ui/Logo';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

const TOKENS = [
  { name: 'bg', cls: 'bg-bg' },
  { name: 'canvas', cls: 'bg-canvas' },
  { name: 'rail', cls: 'bg-rail' },
  { name: 'surface', cls: 'bg-surface' },
  { name: 'surface-2', cls: 'bg-surface-2' },
  { name: 'chip', cls: 'bg-chip' },
  { name: 'border', cls: 'bg-border' },
  { name: 'border-strong', cls: 'bg-border-strong' },
  { name: 'violet-tint', cls: 'bg-violet-tint' },
  { name: 'violet', cls: 'bg-violet' },
  { name: 'violet-hover', cls: 'bg-violet-hover' },
  { name: 'brand', cls: 'bg-brand' },
];

/**
 * Pantalla temporal de la base del front: encabezado con el logotipo arriba a la izquierda y una
 * muestra de los tokens de diseño en claro y oscuro. Se reemplaza por la pantalla de acceso en la
 * siguiente pieza.
 */
export function BasePage() {
  return (
    <div className="flex min-h-full flex-col bg-bg text-text">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <p className="text-sm text-muted">Base del front · pieza 1</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold">Tokens de diseño</h1>
        <p className="mt-3 max-w-2xl text-text-2">
          Colores de la plataforma en modo claro y oscuro. Cambia de modo con el botón de arriba a la derecha. El logotipo
          es morado y no cambia de color, tamaño ni forma en ninguno de los dos.
        </p>

        <section aria-label="Muestras de color" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TOKENS.map((token) => (
            <div key={token.name} className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className={`h-14 ${token.cls}`} />
              <p className="px-3 py-2 text-xs text-text-2">{token.name}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-popover">
          <h2 className="font-heading text-lg font-semibold">Ejemplo de tarjeta</h2>
          <p className="mt-1 text-sm text-text-2">Superficie, borde, texto secundario y botones con el morado de la marca.</p>
          <div className="mt-4 flex gap-3">
            <button type="button" className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-on-violet hover:bg-violet-hover">
              Continuar
            </button>
            <button type="button" className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm text-text-2 hover:text-text">
              Atrás
            </button>
            <span className="inline-flex items-center rounded-full border border-violet-tint-border bg-violet-tint px-3 text-xs text-violet-tint-text">
              Seleccionado
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
