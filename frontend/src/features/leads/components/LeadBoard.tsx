import { useId, useMemo, useState, type DragEvent } from 'react';
import type { Lead, LeadStage } from '@/services/leads';
import { cn } from '@/shared/utils/cn';
import { LeadCard } from './LeadCard';

interface Props {
  stages: LeadStage[];
  leads: Lead[];
  /** Puede mover leads de una etapa a otra (arrastrándolos). */
  canMove: boolean;
  onOpen: (lead: Lead) => void;
  onMove: (leadId: string, stageId: string) => void;
}

/** El tablero: una columna por etapa, con sus leads del más nuevo al más viejo. */
export function LeadBoard({ stages, leads, canMove, onOpen, onMove }: Props) {
  const base = useId();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const groups = new Map<string, Lead[]>(stages.map((stage) => [stage.id, []]));
    for (const lead of leads) groups.get(lead.leadStageId)?.push(lead);
    return groups;
  }, [stages, leads]);

  function startDrag(event: DragEvent<HTMLLIElement>, lead: Lead) {
    if (!canMove) return event.preventDefault();
    event.dataTransfer.effectAllowed = 'move';
    // Algunos navegadores no empiezan a arrastrar sin algún dato.
    event.dataTransfer.setData('text/plain', lead.id);
    setDragging(lead.id);
  }

  function endDrag() {
    setDragging(null);
    setOver(null);
  }

  function drop(event: DragEvent<HTMLElement>, stageId: string) {
    event.preventDefault();
    const leadId = dragging;
    endDrag();
    if (leadId) onMove(leadId, stageId);
  }

  return (
    <div className="relative -mx-6 flex snap-x gap-4 overflow-x-auto px-6 pb-4">
      {stages.map((stage) => {
        const items = byStage.get(stage.id) ?? [];
        const headingId = `${base}-${stage.id}`;
        return (
          <section
            key={stage.id}
            aria-labelledby={headingId}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              setOver(stage.id);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver((previous) => (previous === stage.id ? null : previous));
            }}
            onDrop={(event) => drop(event, stage.id)}
            className={cn(
              'flex w-72 shrink-0 snap-start flex-col rounded-2xl border bg-surface-2 p-3 transition',
              over === stage.id ? 'border-violet bg-violet-tint' : 'border-border',
            )}
          >
            <div className="flex items-center justify-between gap-2 px-1 pb-3">
              <h2 id={headingId} className="truncate text-sm font-semibold">
                {stage.name}
              </h2>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', stage.isWon ? 'bg-violet-tint text-violet-tint-text' : 'bg-chip text-text-2')}>
                {items.length}
                <span className="sr-only"> {items.length === 1 ? 'lead' : 'leads'}</span>
              </span>
            </div>
            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-strong px-3 py-6 text-center text-xs text-muted">{canMove ? 'Arrastra un lead aquí.' : 'Sin leads.'}</p>
            ) : (
              <ul className="space-y-2">
                {items.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} draggable={canMove} dragging={dragging === lead.id} onOpen={onOpen} onDragStart={startDrag} onDragEnd={endDrag} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
