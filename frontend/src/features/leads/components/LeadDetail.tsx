import { useState, type FormEvent, type ReactNode } from 'react';
import type { Lead, LeadStage } from '@/services/leads';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { TextField } from '@/shared/ui/TextField';
import type { ContactChanges } from '@/shared/leads';
import { fullDate, leadTitle, mailtoOf, originOf, telOf, visibleCustomFields } from '../leadDisplay';
import type { Assignee } from '../useAssignees';
import type { SaveResult } from '../useLeadsBoard';
import { LeadContactForm } from './LeadContactForm';

interface Props {
  lead: Lead;
  stages: LeadStage[];
  /** Puede cambiar su etapa y su valor. */
  canEdit: boolean;
  onClose: () => void;
  onMove: (leadId: string, stageId: string) => void;
  /** Devuelve el mensaje de error o `null` si se guardó. */
  onSaveValue: (leadId: string, value: number | null) => Promise<string | null>;
  /** Corrige los datos de contacto y asigna. */
  onSaveDetails: (leadId: string, changes: ContactChanges & { assignedTo?: string | null }) => Promise<SaveResult>;
  /** A quién se puede asignar (vacío si quien mira no administra el negocio). */
  assignees: Assignee[];
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const LINK = 'text-violet-tint-text underline-offset-2 hover:underline';

/** Todo lo que se sabe de un lead. Con permiso, se le cambia la etapa y se le pone un valor estimado. */
export function LeadDetail({ lead, stages, canEdit, onClose, onMove, onSaveValue, onSaveDetails, assignees }: Props) {
  const [text, setText] = useState(lead.value === null ? '' : String(lead.value));
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fields = visibleCustomFields(lead);
  const utm = lead.utm ?? {};
  const mail = mailtoOf(lead.email);
  const tel = telOf(lead.phone);
  const stage = stages.find((item) => item.id === lead.leadStageId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaved(false);
    const trimmed = text.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return setError('Escribe un número mayor o igual a 0.');
    setError(undefined);
    setSaving(true);
    const problem = await onSaveValue(lead.id, value);
    setSaving(false);
    if (problem) setError(problem);
    else setSaved(true);
  }

  return (
    <Modal title={leadTitle(lead)} onClose={onClose}>
      <dl className="divide-y divide-border">
        <Row label="Correo">{lead.email ? mail ? <a href={mail} className={LINK}>{lead.email}</a> : lead.email : <span className="text-muted">—</span>}</Row>
        <Row label="Teléfono">{lead.phone ? tel ? <a href={tel} className={LINK}>{lead.phone}</a> : lead.phone : <span className="text-muted">—</span>}</Row>
        <Row label="Funnel">{lead.funnelName}</Row>
        <Row label="Llegó">{fullDate(lead.createdAt)}</Row>
        <Row label="Origen">
          {originOf(lead)}
          {utm.utm_medium || utm.utm_campaign ? <span className="block text-xs text-muted">{[utm.utm_medium, utm.utm_campaign].filter(Boolean).join(' · ')}</span> : null}
        </Row>
        {fields.map((field) => (
          <Row key={field.label} label={field.label}>
            <span className="whitespace-pre-line">{field.value}</span>
          </Row>
        ))}
      </dl>

      <div className="mt-4 space-y-4 border-t border-border pt-4">
        <div className="text-sm">
          {canEdit ? (
            <>
              <label htmlFor="lead-stage" className="text-text-2">
                Etapa
              </label>
              <select
                id="lead-stage"
                value={lead.leadStageId}
                onChange={(event) => onMove(lead.id, event.target.value)}
                className="mt-1 w-full rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-text outline-none focus:border-violet focus:ring-2 focus:ring-violet/30"
              >
                {stages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <p className="text-text-2">Etapa</p>
              <p className="mt-1">{stage?.name ?? '—'}</p>
            </>
          )}
        </div>

        {canEdit ? (
          <form onSubmit={submit} noValidate className="flex items-start gap-2">
            <div className="flex-1">
              <TextField
                label="Valor estimado"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={text}
                error={error}
                hint={saved ? 'Valor guardado.' : undefined}
                onChange={(event) => {
                  setText(event.target.value);
                  setError(undefined);
                  setSaved(false);
                }}
              />
            </div>
            <Button type="submit" size="sm" className="mt-7" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </form>
        ) : (
          <div className="text-sm">
            <p className="text-text-2">Valor estimado</p>
            <p className="mt-1">{lead.value === null ? '—' : String(lead.value)}</p>
          </div>
        )}

        {canEdit && <LeadContactForm lead={lead} assignees={assignees} onSave={onSaveDetails} />}
      </div>
    </Modal>
  );
}
