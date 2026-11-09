import { useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { InviteForm } from '@/features/team/components/InviteForm';
import { MemberList } from '@/features/team/components/MemberList';
import { RemoveMemberDialog } from '@/features/team/components/RemoveMemberDialog';
import { useTeam } from '@/features/team/useTeam';
import { useWorkspaces } from '@/features/workspaces/WorkspaceProvider';
import type { Member } from '@/services/members';
import { Button } from '@/shared/ui/Button';
import { canManageWorkspace } from '@/shared/utils/permissions';

/** El equipo del negocio activo: quién tiene acceso y con qué rol. Solo quien administra el negocio lo ve. */
export function TeamPage() {
  const { me, token } = useAuth();
  const { active } = useWorkspaces();
  const allowed = canManageWorkspace(active?.role);
  const team = useTeam(token, active?.id, allowed);
  const [removing, setRemoving] = useState<Member | null>(null);
  if (!active) return null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="font-heading text-3xl font-semibold">Equipo</h1>
      <p className="mt-2 text-text-2">Las personas con acceso a {active.name} y lo que pueden hacer.</p>

      {!allowed ? (
        <p role="alert" className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center text-text-2">
          Solo el administrador del negocio gestiona el equipo.
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          <section aria-labelledby="invitar" className="rounded-2xl border border-border bg-surface p-6">
            <h2 id="invitar" className="font-heading text-lg font-semibold">
              Invitar a alguien
            </h2>
            <div className="mt-4">
              <InviteForm onInvite={team.invite} />
            </div>
          </section>

          <section aria-labelledby="personas">
            <h2 id="personas" className="mb-3 font-heading text-lg font-semibold">
              Personas
            </h2>
            {team.status === 'loading' && (
              <p role="status" className="text-sm text-text-2">
                Cargando el equipo…
              </p>
            )}
            {team.status === 'error' && (
              <div className="rounded-2xl border border-border bg-surface p-8 text-center">
                <p role="alert">No se pudo cargar el equipo.</p>
                <Button className="mt-4" onClick={team.retry}>
                  Reintentar
                </Button>
              </div>
            )}
            {team.status === 'ready' && <MemberList members={team.members} currentUserId={me?.user.id} onRemove={setRemoving} />}
          </section>
        </div>
      )}

      {removing && <RemoveMemberDialog member={removing} workspaceName={active.name} onClose={() => setRemoving(null)} onConfirm={team.remove} />}
    </div>
  );
}
