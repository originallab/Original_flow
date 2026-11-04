import { Plus, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { SEARCH_DELAY_MS } from '@/features/leads/constants';
import { LeadBoard } from '@/features/leads/components/LeadBoard';
import { LeadDetail } from '@/features/leads/components/LeadDetail';
import { LeadForm } from '@/features/leads/components/LeadForm';
import { LeadFilters } from '@/features/leads/components/LeadFilters';
import { useAssignees } from '@/features/leads/useAssignees';
import { useLeadsBoard } from '@/features/leads/useLeadsBoard';
import { useWorkspaces } from '@/features/workspaces/WorkspaceProvider';
import { BOARD_PAGE_SIZE } from '@/services/leads';
import { Button, buttonStyles } from '@/shared/ui/Button';
import { canManageLeads, canManageWorkspace, canViewLeads } from '@/shared/utils/permissions';

/** Los leads del negocio activo en un tablero por etapas: se arrastran de una a otra y cada uno abre su detalle. */
export function LeadsPage() {
  const { token } = useAuth();
  const { active } = useWorkspaces();
  const role = active?.role;
  const allowed = canViewLeads(role);
  const board = useLeadsBoard(token, active?.id, allowed);
  const { setFilters } = board;
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const canEdit = canManageLeads(role);
  // Solo quien administra el negocio puede ver el equipo, así que solo ella puede asignar leads.
  const assignees = useAssignees(token, active?.id, allowed && canManageWorkspace(role));

  // El buscador espera un momento después de la última tecla para no pedir los leads en cada letra.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((previous) => ((previous.q ?? '') === query ? previous : { ...previous, q: query })), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, setFilters]);

  const funnelId = board.filters.funnelId ?? '';
  const filtering = funnelId !== '' || query.trim() !== '';
  const open = board.leads.find((lead) => lead.id === openId);

  return (
    <div className="mx-auto w-full max-w-[96rem] px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Leads</h1>
          <p className="mt-2 text-text-2">Las personas que llenaron el formulario de tus páginas, por etapa.</p>
        </div>
        {allowed && canEdit && board.status === 'ready' && (
          <Button onClick={() => setCreating(true)} disabled={board.funnels.length === 0 || board.stages.length === 0} title={board.funnels.length === 0 ? 'Crea un funnel primero' : undefined}>
            <Plus size={16} aria-hidden className="mr-1.5" />
            Nuevo lead
          </Button>
        )}
      </div>

      {!allowed ? (
        <p role="alert" className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center text-text-2">
          Tu rol no tiene acceso a los leads de este negocio.
        </p>
      ) : (
        <div className="mt-8 space-y-5">
          {board.status === 'loading' && (
            <p role="status" className="text-sm text-text-2">
              Cargando tus leads…
            </p>
          )}

          {board.status === 'error' && (
            <div className="rounded-2xl border border-border bg-surface p-8 text-center">
              <p role="alert">No se pudieron cargar tus leads.</p>
              <Button className="mt-4" onClick={board.retry}>
                Reintentar
              </Button>
            </div>
          )}

          {board.status === 'ready' && (
            <>
              <LeadFilters funnels={board.funnels} funnelId={funnelId} query={query} onQuery={setQuery} onFunnel={(id) => setFilters((previous) => ({ ...previous, funnelId: id || undefined }))} />

              {board.notice && (
                <p role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
                  <span>{board.notice}</span>
                  <button type="button" aria-label="Cerrar aviso" onClick={board.dismissNotice} className="shrink-0 text-text-2 hover:text-text">
                    <X size={15} aria-hidden />
                  </button>
                </p>
              )}

              {board.total === 0 && !filtering && !board.refreshing ? (
                <div className="rounded-2xl border border-dashed border-border-strong bg-surface p-10 text-center">
                  <Users size={28} className="mx-auto text-violet-tint-text" aria-hidden />
                  <h2 className="mt-3 font-heading text-lg font-semibold">Todavía no tienes leads</h2>
                  <p className="mx-auto mt-1 max-w-md text-sm text-text-2">Cuando alguien llene el formulario de una página publicada, aparecerá aquí en la primera etapa.</p>
                  <Link to="/funnels" className={`${buttonStyles()} mt-5`}>
                    Ver mis funnels
                  </Link>
                </div>
              ) : (
                <div aria-busy={board.refreshing}>
                  {board.total === 0 && (
                    <p role="status" className="mb-4 text-sm text-text-2">
                      {board.refreshing ? 'Buscando…' : 'Ningún lead coincide con tu búsqueda.'}
                    </p>
                  )}
                  {board.total > board.leads.length && (
                    <p role="status" className="mb-4 text-sm text-text-2">
                      Mostrando los {BOARD_PAGE_SIZE} leads más recientes de {board.total}. Usa el buscador o el filtro de funnel para acotar.
                    </p>
                  )}
                  <LeadBoard stages={board.stages} leads={board.leads} canMove={canEdit} onOpen={(lead) => setOpenId(lead.id)} onMove={(id, stageId) => void board.move(id, stageId)} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {open && <LeadDetail lead={open} stages={board.stages} canEdit={canEdit} onClose={() => setOpenId(null)} onMove={(id, stageId) => void board.move(id, stageId)} onSaveValue={board.saveValue} onSaveDetails={board.saveDetails} assignees={assignees} />}
      {creating && <LeadForm funnels={board.funnels} stages={board.stages} defaultFunnelId={funnelId} onClose={() => setCreating(false)} onCreate={board.create} />}
    </div>
  );
}
