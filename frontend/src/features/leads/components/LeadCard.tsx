import type { DragEvent } from 'react';
import type { Lead } from '@/services/leads';
import { cn } from '@/shared/utils/cn';
import { formatValue, leadContact, leadTitle, originOf, relativeDate } from '../leadDisplay';

interface Props {
  lead: Lead;
  /** Se puede arrastrar a otra etapa. */
  draggable: boolean;
  dragging: boolean;
  onOpen: (lead: Lead) => void;
  onDragStart: (event: DragEvent<HTMLLIElement>, lead: Lead) => void;
  onDragEnd: () => void;
}

/** Un lead en su columna: quién es, de dónde vino y cuándo llegó. Abre su detalle y, con permiso, se arrastra a otra etapa. */
export function LeadCard({ lead, draggable, dragging, onOpen, onDragStart, onDragEnd }: Props) {
  const contact = leadContact(lead);
  return (
    <li draggable={draggable} onDragStart={(event) => onDragStart(event, lead)} onDragEnd={onDragEnd} className={cn(dragging && 'opacity-40')}>
      <button
        type="button"
        onClick={() => onOpen(lead)}
        className={cn(
          'block w-full rounded-xl border border-border bg-surface p-3 text-left transition hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet',
          draggable && 'cursor-grab active:cursor-grabbing',
        )}
      >
        <span className="block truncate text-sm font-medium">{leadTitle(lead)}</span>
        {contact.map((line) => (
          <span key={line} className="block truncate text-xs text-text-2">
            {line}
          </span>
        ))}
        <span className="mt-2 block truncate text-xs text-muted">{lead.funnelName}</span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="rounded-full bg-chip px-2 py-0.5 text-text-2">{originOf(lead)}</span>
          <span>{relativeDate(lead.createdAt)}</span>
          {lead.value !== null && <span className="ml-auto font-medium text-text-2">{formatValue(lead.value)}</span>}
        </span>
      </button>
    </li>
  );
}
