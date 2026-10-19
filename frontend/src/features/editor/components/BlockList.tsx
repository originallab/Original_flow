import { AlertCircle, ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { ADDABLE_BLOCKS, BLOCKS } from '@/shared/blocks/catalog';
import { MAX_BLOCKS, type Block, type BlockType } from '@/shared/blocks/types';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';
import type { BlockErrors } from '../useFunnelEditor';

interface Props {
  blocks: Block[];
  selectedKey: string | null;
  errors: BlockErrors;
  onSelect: (key: string) => void;
  onAdd: (type: BlockType, afterKey: string | null) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, delta: number) => void;
}

/** Un resumen corto de lo que dice el bloque, para reconocerlo en la lista. */
function excerpt(block: Block): string {
  const c = block.content;
  const firstItem = Array.isArray(c.items) ? c.items[0] : Array.isArray(c.plans) ? c.plans[0] : undefined;
  const fromItem = typeof firstItem === 'string' ? firstItem : typeof firstItem === 'object' && firstItem !== null ? (firstItem as Record<string, unknown>) : undefined;
  const itemText = typeof fromItem === 'string' ? fromItem : (fromItem?.title ?? fromItem?.question ?? fromItem?.name);
  const found = [c.title, c.label, c.submitLabel, c.subtitle, c.body, itemText].find((value) => typeof value === 'string' && value.trim() !== '');
  return typeof found === 'string' ? found : '';
}

/** Menú de la izquierda: los bloques de la página en orden (para elegirlos, subirlos, bajarlos o quitarlos) y el botón para agregar más. */
export function BlockList({ blocks, selectedKey, errors, onSelect, onAdd, onRemove, onMove }: Props) {
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const full = blocks.length >= MAX_BLOCKS;

  return (
    <nav aria-label="Bloques de la página" className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Bloques</h2>
        <span className="text-xs text-muted">{blocks.length}</span>
      </div>

      <ol className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {blocks.map((block, index) => {
          const selected = block.key === selectedKey;
          const hasErrors = Boolean(errors[block.key]);
          const hint = excerpt(block);
          return (
            <li key={block.key} className={cn('rounded-lg border', selected ? 'border-violet bg-violet-tint' : 'border-transparent hover:bg-surface-2')}>
              <button type="button" aria-current={selected ? 'true' : undefined} onClick={() => onSelect(block.key)} className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-violet">
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-medium', selected && 'text-violet-tint-text')}>{BLOCKS[block.type].label}</span>
                  {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
                </span>
                {hasErrors && (
                  <span role="img" aria-label="Tiene campos por corregir" className="mt-0.5 text-red-500">
                    <AlertCircle size={15} aria-hidden />
                  </span>
                )}
              </button>

              {selected && (
                <div className="flex items-center justify-end gap-1 px-2 pb-2">
                  {confirming === block.key ? (
                    <>
                      <span className="mr-auto pl-1 text-xs text-text-2">¿Quitar este bloque?</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          onRemove(block.key);
                          setConfirming(null);
                        }}
                      >
                        Sí, quitar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <button type="button" aria-label="Subir bloque" disabled={index === 0} onClick={() => onMove(block.key, -1)} className="grid size-7 place-items-center rounded-md text-text-2 hover:bg-surface disabled:opacity-30">
                        <ArrowUp size={14} aria-hidden />
                      </button>
                      <button type="button" aria-label="Bajar bloque" disabled={index === blocks.length - 1} onClick={() => onMove(block.key, 1)} className="grid size-7 place-items-center rounded-md text-text-2 hover:bg-surface disabled:opacity-30">
                        <ArrowDown size={14} aria-hidden />
                      </button>
                      <button type="button" aria-label="Quitar bloque" onClick={() => setConfirming(block.key)} className="grid size-7 place-items-center rounded-md text-text-2 hover:bg-surface hover:text-red-500">
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {blocks.length === 0 && <li className="px-3 py-4 text-sm text-muted">Esta página no tiene bloques. Agrega el primero.</li>}
      </ol>

      <div className="border-t border-border p-3">
        {picking ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Elige un bloque</p>
              <button type="button" aria-label="Cerrar la lista de bloques" onClick={() => setPicking(false)} className="grid size-6 place-items-center rounded-md text-text-2 hover:bg-surface-2">
                <X size={14} aria-hidden />
              </button>
            </div>
            <ul aria-label="Bloques disponibles" className="max-h-64 space-y-1 overflow-y-auto">
              {ADDABLE_BLOCKS.map((def) => (
                <li key={def.type}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(def.type, selectedKey);
                      setPicking(false);
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-violet"
                  >
                    <span className="block text-sm font-medium">{def.label}</span>
                    <span className="block text-xs text-muted">{def.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Button variant="secondary" className="w-full" disabled={full} onClick={() => setPicking(true)}>
            <Plus size={16} aria-hidden /> Agregar bloque
          </Button>
        )}
        {full && <p className="mt-2 text-xs text-muted">Llegaste al máximo de {MAX_BLOCKS} bloques.</p>}
      </div>
    </nav>
  );
}
