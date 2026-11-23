import type { CSSProperties } from 'react';
import type { Block, DesignSpec } from '@/shared/blocks/types';
import { backgroundOf } from '@/shared/design';
import type { PublicContext } from './public';
import { BLOCKS } from '@/shared/blocks/catalog';
import { cn } from '@/shared/utils/cn';
import { BlockView } from './blocks';
import { fontStyle, PAGE_FONTS_CLASS, useGoogleFonts } from './fonts';
import { backdropStyle, resolveTheme, toneOf } from './theme';

interface Props {
  blocks: Block[];
  design: DesignSpec | null | undefined;
  currency?: string;
  /** `edit`: cada bloque se puede elegir con un clic; `preview`: solo se ve la página; `public`: la página publicada, con todo funcionando. */
  mode?: 'edit' | 'preview' | 'public';
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  /** Solo en `public`: lo que necesitan el formulario y los botones para funcionar. */
  publicContext?: PublicContext;
}

/**
 * Dibuja una página a partir de sus bloques y su diseño (plantilla y paleta). La usa el editor y la
 * usará la página pública. Los colores son SIEMPRE los de la página (la marca del cliente), nunca los de la plataforma.
 */
export function PageRenderer({ blocks, design, currency = 'MXN', mode = 'preview', selectedKey = null, onSelect, publicContext }: Props) {
  const theme = resolveTheme(design);
  useGoogleFonts(theme.fonts);
  const editing = mode === 'edit';
  const ordered = [...blocks].sort((a, b) => a.order - b.order);

  return (
    <article aria-label="Página" data-template={theme.template} className={cn('font-sans', PAGE_FONTS_CLASS, mode !== 'public' && 'overflow-hidden')} style={{ backgroundColor: theme.palette.background, color: theme.palette.text, ...backdropStyle(theme), ...fontStyle(theme) }}>
      {ordered.length === 0 && <p className="px-8 py-16 text-center text-sm opacity-60">Esta página todavía no tiene bloques.</p>}
      {ordered.map((block, position) => {
        const selected = editing && block.key === selectedKey;
        const tone = toneOf(theme, backgroundOf(block.style));
        // La franja de color de un bloque: en la página publicada llena todo el ancho de la pantalla.
        // Con el corte «en diagonal», el borde inferior de cada franja de color baja hacia un lado (menos la última).
        const slanted = theme.look.divider === 'slant' && position < ordered.length - 1;
        const cut = '2.5rem';
        const wide = mode === 'public';
        const slant = slanted ? { paddingBottom: cut, clipPath: wide ? `polygon(-100vmax 0, calc(100% + 100vmax) 0, calc(100% + 100vmax) calc(100% - ${cut}), -100vmax 100%)` : `polygon(0 0, 100% 0, 100% calc(100% - ${cut}), 0 100%)` } : null;
        const strip: CSSProperties | undefined = tone.background
          ? wide
            ? { background: tone.background, color: tone.color ?? undefined, boxShadow: `0 0 0 100vmax ${tone.background}`, clipPath: 'inset(0 -100vmax)', ...slant }
            : { background: tone.background, color: tone.color ?? undefined, ...slant }
          : undefined;
        return (
          <div
            key={block.key}
            data-block-key={block.key}
            onClick={editing ? () => onSelect?.(block.key) : undefined}
            className={cn('relative', editing && 'cursor-pointer outline-2 -outline-offset-2 transition hover:outline hover:outline-dashed', selected && 'outline outline-solid')}
            style={{ ...strip, ...(editing ? { outlineColor: theme.palette.primary } : null) }}
          >
            {selected && (
              <span className="absolute left-2 top-2 z-10 rounded px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: theme.palette.primary }}>
                {BLOCKS[block.type].label}
              </span>
            )}
            <BlockView block={block} theme={tone.theme} currency={currency} publicCtx={mode === 'public' ? publicContext : undefined} />
          </div>
        );
      })}
    </article>
  );
}
