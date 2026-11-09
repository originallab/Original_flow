import { useState, type FormEvent } from 'react';
import type { Lead } from '@/services/leads';
import { validateContactChanges, type ContactChanges } from '@/shared/leads';
import { Button } from '@/shared/ui/Button';
import { SelectField } from '@/shared/ui/SelectField';
import { TextField } from '@/shared/ui/TextField';
import type { Assignee } from '../useAssignees';
import type { SaveResult } from '../useLeadsBoard';

interface Props {
  lead: Lead;
  /** A quién se puede asignar; vacío si quien mira no administra el negocio (no se ofrece asignar). */
  assignees: Assignee[];
  onSave: (leadId: string, changes: ContactChanges & { assignedTo?: string | null }) => Promise<SaveResult>;
}

/** Corregir el nombre, el correo y el teléfono de un lead, y asignarlo a alguien del equipo. Solo manda lo que cambió. */
export function LeadContactForm({ lead, assignees, onSave }: Props) {
  const [name, setName] = useState(lead.name ?? '');
  const [email, setEmail] = useState(lead.email ?? '');
  const [phone, setPhone] = useState(lead.phone ?? '');
  const [assignedTo, setAssignedTo] = useState(lead.assignedTo ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const touch = (field: string) => {
    setErrors((previous) => ({ ...previous, [field]: '' }));
    setMessage(null);
    setSaved(false);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaved(false);
    setMessage(null);

    const changes: ContactChanges & { assignedTo?: string | null } = {};
    const nextName = name.trim();
    const nextEmail = email.trim();
    const nextPhone = phone.trim();
    if (nextName !== (lead.name ?? '')) changes.name = nextName || null;
    if (nextEmail.toLowerCase() !== (lead.email ?? '')) changes.email = nextEmail || null;
    if (nextPhone !== (lead.phone ?? '')) changes.phone = nextPhone || null;
    if (assignedTo !== (lead.assignedTo ?? '')) changes.assignedTo = assignedTo || null;
    if (Object.keys(changes).length === 0) return setMessage('No hay cambios que guardar.');

    const issues = validateContactChanges(lead, changes);
    if (issues.length > 0) return setErrors(Object.fromEntries(issues.map((issue) => [String(issue.path[0]), issue.message])));
    setErrors({});
    setSaving(true);
    const result = await onSave(lead.id, changes);
    setSaving(false);
    if (result.ok) return setSaved(true);
    setErrors(result.fields);
    setMessage(result.message ?? null);
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Datos de contacto" className="space-y-3 border-t border-border pt-4">
      <h3 className="font-heading text-sm font-semibold">Datos de contacto</h3>
      <TextField label="Nombre" value={name} error={errors.name} autoComplete="off" onChange={(event) => (setName(event.target.value), touch('name'))} />
      <TextField label="Correo" type="email" value={email} error={errors.email} autoComplete="off" onChange={(event) => (setEmail(event.target.value), touch('email'))} />
      <TextField label="Teléfono" type="tel" value={phone} error={errors.phone} autoComplete="off" onChange={(event) => (setPhone(event.target.value), touch('phone'))} />
      {assignees.length > 0 && (
        <SelectField label="Asignado a" value={assignedTo} error={errors.assignedTo} onChange={(event) => (setAssignedTo(event.target.value), touch('assignedTo'))}>
          <option value="">Sin asignar</option>
          {assignees.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.label}
            </option>
          ))}
        </SelectField>
      )}
      {message && (
        <p role="alert" className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm">
          {message}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-text-2">
          Datos guardados.
        </p>
      )}
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar datos'}
      </Button>
    </form>
  );
}
