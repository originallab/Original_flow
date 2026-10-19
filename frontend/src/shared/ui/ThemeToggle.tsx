import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/shared/theme/ThemeProvider';

/** Botón para alternar entre modo claro y oscuro. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'claro' : 'oscuro';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Cambiar a modo ${next}`}
      title={`Cambiar a modo ${next}`}
      className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-text-2 transition hover:border-border-strong hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
