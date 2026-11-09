import type { Member } from '@/services/members';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';
import { roleLabel } from '@/shared/roles';

interface Props {
  members: Member[];
  /** El id de la persona que está mirando la pantalla: a sí misma no se puede quitar desde aquí. */
  currentUserId: string | undefined;
  onRemove: (member: Member) => void;
}

/** Las personas del equipo: quién es, su rol, si ya inició sesión y, para quitarla, un botón. */
export function MemberList({ members, currentUserId, onRemove }: Props) {
  return (
    <ul aria-label="Equipo" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {members.map((member) => {
        const isMe = member.userId !== null && member.userId === currentUserId;
        const title = member.name ?? member.email ?? 'Sin nombre';
        return (
          <li key={member.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {title}
                {isMe && <span className="ml-2 text-xs font-normal text-muted">(tú)</span>}
              </p>
              {member.name && member.email && <p className="truncate text-sm text-text-2">{member.email}</p>}
            </div>
            <span className="rounded-full bg-chip px-2.5 py-0.5 text-xs font-medium text-text-2">{roleLabel(member.role)}</span>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', member.status === 'active' ? 'bg-violet-tint text-violet-tint-text' : 'border border-border-strong text-text-2')}>
              {member.status === 'active' ? 'Activo' : 'Invitado'}
            </span>
            {member.status === 'invited' && <span className="basis-full text-xs text-muted">Todavía no inicia sesión; tendrá acceso cuando entre con ese correo.</span>}
            {!isMe && (
              <Button variant="secondary" size="sm" onClick={() => onRemove(member)} aria-label={`Quitar a ${title}`}>
                Quitar
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
