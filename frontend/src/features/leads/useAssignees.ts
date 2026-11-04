import { useEffect, useState } from 'react';
import { listMembers } from '@/services/members';

/** Alguien a quien se puede asignar un lead: el id que usa la API (`userId`) y cómo se muestra. */
export interface Assignee {
  userId: string;
  label: string;
}

/**
 * Las personas del equipo que ya tienen cuenta, para asignarles leads. Solo quien administra el negocio puede ver el
 * equipo (la API se lo niega al resto), así que con `enabled` en `false` no se pide nada. Si no se puede cargar, la
 * lista queda vacía y el detalle del lead simplemente no ofrece asignar.
 */
export function useAssignees(token: string | null, workspaceId: string | undefined, enabled: boolean): Assignee[] {
  const [assignees, setAssignees] = useState<Assignee[]>([]);

  useEffect(() => {
    setAssignees([]);
    if (!enabled || !token || !workspaceId) return;
    const controller = new AbortController();
    listMembers(token, workspaceId, controller.signal)
      .then((members) => {
        if (controller.signal.aborted) return;
        setAssignees(members.flatMap((member) => (member.status === 'active' && member.userId ? [{ userId: member.userId, label: member.name?.trim() || member.email || 'Sin nombre' }] : [])));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [token, workspaceId, enabled]);

  return assignees;
}
