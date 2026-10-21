import { useId, useState, type FormEvent } from 'react';
import { INVITABLE_ROLES, type InvitableRole, type Member } from '@/services/members';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { EMAIL } from '@/shared/leads';
import { ROLE_HINTS, ROLE_LABELS } from '@/shared/roles';
import type { InviteResult } from '../useTeam';

interface Props {
  onInvite: (email: string, role: InvitableRole) => Promise<InviteResult>;
}

/** Qué se le dice a quien invita según lo que pasó con la persona (no se manda ningún correo: tiene que avisarle). */
export function invitedNotice(member: Member): string {
  const who = member.email ?? 'La persona';
  return member.status === 'active'
    ? `${who} ya tiene cuenta y tiene acceso desde ahora.`
    : `${who} todavía no tiene cuenta. Verá el negocio cuando inicie sesión con ese correo; no enviamos ningún correo, avísale tú.`;
}

/** Invita a alguien por correo con el rol que va a tener. */
export function InviteForm({ onInvite }: Props) {
  const roleId = useId();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('vendedor');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setNotice(null);
    setFormError(null);
    const trimmed = email.trim();
    if (trimmed === '') return setErrors({ email: 'Escribe el correo de la persona.' });
    if (!EMAIL.test(trimmed)) return setErrors({ email: 'Escribe un correo válido.' });
    setErrors({});
    setBusy(true);
    const result = await onInvite(trimmed, role);
    setBusy(false);
    if (result.ok) {
      setEmail('');
      setNotice(invitedNotice(result.member));
    } else {
      setErrors(result.fields);
      setFormError(result.message ?? null);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Invitar a una persona" className="@container">
      <div className="grid gap-4 @xl:grid-cols-[1fr_14rem_auto] @xl:items-start">
        <TextField
          label="Correo"
          type="email"
          autoComplete="off"
          placeholder="nombre@empresa.com"
          value={email}
          error={errors.email}
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((previous) => ({ ...previous, email: '' }));
            setNotice(null);
          }}
        />
        <div className="text-sm">
          <label htmlFor={roleId} className="text-text-2">
            Rol
          </label>
          <select
            id={roleId}
            value={role}
            aria-invalid={errors.role ? true : undefined}
            aria-describedby={`${roleId}-hint`}
            onChange={(event) => {
              setRole(event.target.value as InvitableRole);
              setErrors((previous) => ({ ...previous, role: '' }));
            }}
            className="mt-1 h-[42px] w-full rounded-lg border border-border-strong bg-surface-2 px-3 text-text outline-none focus:border-violet focus:ring-2 focus:ring-violet/30"
          >
            {INVITABLE_ROLES.map((item) => (
              <option key={item} value={item}>
                {ROLE_LABELS[item]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" className="@xl:mt-7" disabled={busy}>
          {busy ? 'Invitando…' : 'Invitar'}
        </Button>
      </div>
      <p id={`${roleId}-hint`} className="mt-2 text-xs text-muted">
        {errors.role || ROLE_HINTS[role]}
      </p>
      {formError && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {formError}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-violet-tint-text">
          {notice}
        </p>
      )}
    </form>
  );
}
