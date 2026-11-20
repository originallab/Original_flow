import type { Block } from '@/shared/blocks/types';
import { BACKGROUNDS, BACKGROUND_LABELS, BLOCK_VARIANTS, VARIANT_LABELS, backgroundOf, variantOf } from '@/shared/design';
import { SelectField } from '@/shared/ui/SelectField';

interface Props {
  block: Block;
  onChange: (style: Record<string, unknown>) => void;
}

/** Cómo se ve este bloque: su forma (si tiene varias) y el fondo de su franja. Lo mismo que puede elegir la IA. */
export function BlockStyleFields({ block, onChange }: Props) {
  const variants = BLOCK_VARIANTS[block.type];
  const variant = variantOf(block.type, block.style);
  const background = backgroundOf(block.style);

  /** Deja en el estilo solo lo elegido: «normal» (la primera opción y el fondo de la página) no se guarda. */
  const change = (key: 'variant' | 'background', value: string) => {
    const next: Record<string, unknown> = { ...block.style, [key]: value };
    if (value === '' || (key === 'background' && value === 'base') || (key === 'variant' && value === variants?.[0])) delete next[key];
    onChange(next);
  };

  return (
    <fieldset className="mt-5 space-y-3 border-t border-border pt-4">
      <legend className="sr-only">Diseño del bloque</legend>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Diseño del bloque</p>
      {variants && (
        <SelectField label="Forma" value={variant ?? variants[0]} onChange={(event) => change('variant', event.target.value)}>
          {variants.map((option) => (
            <option key={option} value={option}>
              {VARIANT_LABELS[option] ?? option}
            </option>
          ))}
        </SelectField>
      )}
      <SelectField label="Fondo" value={background} onChange={(event) => change('background', event.target.value)}>
        {BACKGROUNDS.map((option) => (
          <option key={option} value={option}>
            {BACKGROUND_LABELS[option]}
          </option>
        ))}
      </SelectField>
    </fieldset>
  );
}
