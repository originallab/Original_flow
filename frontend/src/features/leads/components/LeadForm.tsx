import { useState, type FormEvent } from 'react';
import type { FunnelSummary } from '@/services/funnels';
import type { LeadStage, NewLead } from '@/services/leads';
import { validateManualLead } from '@/shared/leads';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { SelectField } from '@/shared/ui/SelectField';
import { TextField } from '@/shared/ui/TextField';
import type { SaveResult } from '../useLeadsBoard';

interface Props {
  funnels: FunnelSummary[];
  stages: LeadStage[];
  /** El funnel que se propone (el que está filtrado en el tablero); si no, el primero. */
  defaultFunnelId?: string;
  onClose: () => void;
  onCreate: (body: NewLead) => Promise<SaveResult>;
}

/** Dar de alta un lead a mano: alguien que no llegó por el formulario de una página (una llamada, WhatsApp, un evento). */
export function LeadForm({ funnels, stages, defaultFunnelId, onClose, onCreate }: Props) {
  const [funnelId, setFunnelId] = useState(funnels.some((funnel) => funnel.id === defaultFunnelId) ? (defaultFunnelId as string) : (funnels[0]?.id ?? ''));
  const [stageId, setStageId] = useState(stages[0]?.id ?? '');
  const [source, setSource] = useState<'web_form' | 'whatsapp'>('web_form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clear = (field: string) => setErrors((previous) => ({ ...previous, [field]: '' }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setMessage(null);
    const trimmed = value.trim();
    const body: NewLead = {
      funnelId,
      leadStageId: stageId || undefined,
      source,
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(trimmed ? { value: Number(trimmed) } : {}),
    };
    const issues = validateManualLead(body);
    if (issues.length > 0) {
      setErrors(Object.fromEntries(issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    setSaving(true);
    const result = await onCreate(body);
    setSaving(false);
    if (result.ok) return onClose();
    setErrors(result.fields);
    setMessage(result.message ?? null);
  }

  return (
    <Modal title="Nuevo lead" onClose={onClose} locked={saving}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-text-2">Para alguien que no llegó por el formulario de una página. Deja al menos un correo o un teléfono.</p>

        <SelectField label="Funnel" value={funnelId} error={errors.funnelId} onChange={(event) => (setFunnelId(event.target.value), clear('funnelId'))}>
          {funnels.map((funnel) => (
            <option key={funnel.id} value={funnel.id}>
              {funnel.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Nombre" value={name} error={errors.name} autoComplete="off" onChange={(event) => (setName(event.target.value), clear('name'))} />
        <TextField label="Correo" type="email" value={email} error={errors.email} autoComplete="off" onChange={(event) => (setEmail(event.target.value), clear('email'))} />
        <TextField label="Teléfono" type="tel" value={phone} error={errors.phone} autoComplete="off" onChange={(event) => (setPhone(event.target.value), clear('phone'))} />
        <TextField label="Valor estimado (opcional)" type="number" inputMode="decimal" min={0} step="0.01" value={value} error={errors.value} onChange={(event) => (setValue(event.target.value), clear('value'))} />
        <SelectField label="Etapa" value={stageId} error={errors.leadStageId} onChange={(event) => (setStageId(event.target.value), clear('leadStageId'))}>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Cómo llegó" value={source} error={errors.source} onChange={(event) => setSource(event.target.value as 'web_form' | 'whatsapp')}>
          <option value="web_form">Formulario web</option>
          <option value="whatsapp">WhatsApp</option>
        </SelectField>

        {message && (
          <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
            {message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Crear lead'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
