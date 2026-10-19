import type { Block, DesignSpec } from '@/shared/blocks/types';
import { BLOCKS } from '@/shared/blocks/catalog';
import { cn } from '@/shared/utils/cn';
import { BlockView } from './blocks';
import { resolveTheme } from './theme';

interface Props {
  blocks: Block[];
  design: DesignSpec | null | undefined;
  currency?: string;
  /** `edit`: cada bloque se puede elegir con un clic; `preview`: solo se ve la página. */
  mode?: 'edit' | 'preview';
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
}

/**
 * Dibuja una página a partir de sus bloques y su diseño (plantilla y paleta). La usa el editor y la
 * usará la página pública. Los colores son SIEMPRE los de la página (la marca del cliente), nunca los de la plataforma.
 */
export function PageRenderer({ blocks, design, currency = 'MXN', mode = 'preview', selectedKey = null, onSelect }: Props) {
  const theme = resolveTheme(design);
  const editing = mode === 'edit';
  const ordered = [...blocks].sort((a, b) => a.order - b.order);

  return (
    <article aria-label="Página" data-template={theme.template} className="overflow-hidden font-sans" style={{ background: theme.palette.background, color: theme.palette.text }}>
      {ordered.length === 0 && <p className="px-8 py-16 text-center text-sm opacity-60">Esta página todavía no tiene bloques.</p>}
      {ordered.map((block) => {
        const selected = editing && block.key === selectedKey;
        return (
          <div
            key={block.key}
            data-block-key={block.key}
            onClick={editing ? () => onSelect?.(block.key) : undefined}
            className={cn('relative', editing && 'cursor-pointer outline-2 -outline-offset-2 transition hover:outline hover:outline-dashed', selected && 'outline outline-solid')}
            style={editing ? { outlineColor: theme.palette.primary } : undefined}
          >
            {selected && (
              <span className="absolute left-2 top-2 z-10 rounded px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: theme.palette.primary }}>
                {BLOCKS[block.type].label}
              </span>
            )}
            <BlockView block={block} theme={theme} currency={currency} />
          </div>
        );
      })}
    </article>
  );
}
