import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/services/api';
import { inviteMember, listMembers, removeMember, type InvitableRole, type Member } from '@/services/members';

type Load = 'loading' | 'ready' | 'error';

export type InviteResult = { ok: true; member: Member } | { ok: false; fields: Record<string, string>; message?: string };

export const DUPLICATE_MESSAGE = 'Esa persona ya es parte del equipo o ya fue invitada.';
export const LAST_ADMIN_MESSAGE = 'No se puede quitar al único administrador del negocio.';

/** El equipo de un negocio: quiénes son, y las dos acciones que lo cambian (invitar y quitar), con sus errores ya explicados. */
export function useTeam(token: string | null, workspaceId: string | undefined, enabled = true) {
  const [members, setMembers] = useState<Member[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !token || !workspaceId) return;
    const controller = new AbortController();
    setLoad('loading');
    listMembers(token, workspaceId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setMembers(items);
        setLoad('ready');
      })
      .catch(() => !controller.signal.aborted && setLoad('error'));
    return () => controller.abort();
  }, [enabled, token, workspaceId, attempt]);

  const invite = useCallback(
    async (email: string, role: InvitableRole): Promise<InviteResult> => {
      if (!token || !workspaceId) return { ok: false, fields: {}, message: 'Tu sesión terminó. Vuelve a entrar.' };
      try {
        const member = await inviteMember(token, workspaceId, { email, role });
        setMembers((previous) => [...previous, member]);
        return { ok: true, member };
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return { ok: false, fields: { email: DUPLICATE_MESSAGE } };
        if (err instanceof ApiError && err.status === 422) {
          const fields = err.fieldErrors();
          if (Object.keys(fields).length > 0) return { ok: false, fields };
        }
        return { ok: false, fields: {}, message: 'No se pudo invitar. Inténtalo de nuevo.' };
      }
    },
    [token, workspaceId],
  );

  /** Quita a una persona. Devuelve el mensaje de error o `null` si se quitó. */
  const remove = useCallback(
    async (memberId: string): Promise<string | null> => {
      if (!token || !workspaceId) return 'Tu sesión terminó. Vuelve a entrar.';
      try {
        await removeMember(token, workspaceId, memberId);
        setMembers((previous) => previous.filter((member) => member.id !== memberId));
        return null;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409 && err.code === 'LAST_CLIENT_ADMIN') return LAST_ADMIN_MESSAGE;
        if (err instanceof ApiError && err.status === 404) {
          // Ya no estaba (otra persona la quitó): se deja la lista como está en el servidor.
          setAttempt((n) => n + 1);
          return null;
        }
        return 'No se pudo quitar. Inténtalo de nuevo.';
      }
    },
    [token, workspaceId],
  );

  return { status: load, members, invite, remove, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}
