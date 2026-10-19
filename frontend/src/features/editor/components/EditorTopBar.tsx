import { AlertCircle, ArrowLeft, Check, Eye, Loader2, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { cn } from '@/shared/utils/cn';
import type { SaveStatus } from '../useFunnelEditor';

interface Props {
  name: string;
  templateName: string;
  status: SaveStatus;
  preview: boolean;
  onTogglePreview: () => void;
  onRetry: () => void;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Guardado',
  dirty: 'Cambios sin guardar…',
  saving: 'Guardando…',
  invalid: 'Corrige los campos marcados para guardar',
  error: 'No se pudo guardar',
};

/** Barra superior del editor: el logotipo a la izquierda (como en toda la plataforma), el nombre del funnel, el estado del guardado y la vista previa. */
export function EditorTopBar({ name, templateName, status, preview, onTogglePreview, onRetry }: Props) {
  const failing = status === 'invalid' || status === 'error';
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 sm:px-6">
      <Logo />
      <span aria-hidden className="hidden h-6 w-px bg-border-strong sm:block" />
      <Link to="/funnels" className="inline-flex items-center gap-1.5 text-sm text-text-2 hover:text-text focus-visible:outline-2 focus-visible:outline-violet">
        <ArrowLeft size={15} aria-hidden /> <span className="hidden sm:inline">Funnels</span>
        <span className="sr-only sm:hidden">Volver a funnels</span>
      </Link>
      <div className="hidden min-w-0 md:block">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted">Plantilla {templateName}</p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <p role="status" className={cn('inline-flex items-center gap-1.5 text-sm', failing ? 'text-red-500' : 'text-muted')}>
          {status === 'saving' && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {status === 'saved' && <Check size={14} aria-hidden />}
          {failing && <AlertCircle size={14} aria-hidden />}
          {/* En pantallas chicas solo queda el ícono (el texto lo leen los lectores de pantalla). */}
          <span className="sr-only sm:not-sr-only">{STATUS_TEXT[status]}</span>
        </p>
        {status === 'error' && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Reintentar
          </Button>
        )}
        <Button size="sm" variant={preview ? 'primary' : 'secondary'} aria-pressed={preview} aria-label={preview ? 'Volver a editar' : 'Vista previa'} onClick={onTogglePreview}>
          {preview ? <Pencil size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
          <span className="hidden sm:inline">{preview ? 'Volver a editar' : 'Vista previa'}</span>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
