import { Button } from '@/shared/ui/Button';
import { useWorkspaces } from './WorkspaceProvider';

/**
 * Lo que se muestra mientras la lista de negocios no está lista: «Cargando…» o, si falló, el aviso
 * con «Reintentar». Devuelve `null` cuando ya está lista (quien lo usa pinta entonces su contenido).
 */
export function LoadState() {
  const { status, retry } = useWorkspaces();
  if (status === 'idle' || status === 'loading') {
    return (
      <p role="status" className="text-sm text-text-2">
        Cargando tus negocios…
      </p>
    );
  }
  if (status === 'error') {
    return (
      <div className="text-center">
        <p role="alert">No se pudieron cargar tus negocios.</p>
        <Button className="mt-4" onClick={retry}>
          Reintentar
        </Button>
      </div>
    );
  }
  return null;
}
