import { useState } from 'react';
import type { BrandPalette } from '@/services/workspaces';
import { cn } from '@/shared/utils/cn';
import { normalizeHex, PALETTE_KEYS, PALETTE_LABELS, type PaletteKey } from '../brand';

interface Props {
  value: BrandPalette;
  onChange: (palette: BrandPalette) => void;
  disabled?: boolean;
}

/** Seis dígitos hexadecimales: solo entonces se aplica el color mientras se escribe (con `#` o sin él). */
const FULL_HEX = /^#?[0-9a-f]{6}$/i;

/**
 * Una de las cinco muestras: el selector de color del navegador y el código hexadecimal editable a
 * mano. Mientras se escribe no se aplica nada a medias (`#ff0` ya sería válido y se expandiría a
 * `#FFFF00` en pleno tecleo); al salir del campo se acepta también la forma corta o se avisa del error.
 */
function Swatch({ name, color, onCommit, disabled }: { name: PaletteKey; color: string; onCommit: (hex: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState<{ text: string; left: boolean } | null>(null);
  const label = PALETTE_LABELS[name];
  const invalid = draft !== null && draft.left && normalizeHex(draft.text) === null;

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <input
        type="color"
        aria-label={`Selector de color: ${label}`}
        value={color.toLowerCase()}
        disabled={disabled}
        onChange={(e) => {
          setDraft(null);
          onCommit(e.target.value.toUpperCase());
        }}
        className="h-12 w-full cursor-pointer rounded-lg border border-border bg-transparent p-0 disabled:cursor-default"
      />
      <p className="mt-2 text-sm font-medium">{label}</p>
      <input
        type="text"
        aria-label={`Código de color: ${label}`}
        aria-invalid={invalid || undefined}
        value={draft?.text ?? color}
        disabled={disabled}
        maxLength={7}
        spellCheck={false}
        onChange={(e) => {
          const text = e.target.value;
          if (FULL_HEX.test(text.trim())) {
            setDraft(null);
            onCommit(normalizeHex(text)!);
          } else {
            setDraft({ text, left: false });
          }
        }}
        onBlur={() => {
          if (draft === null) return;
          const hex = normalizeHex(draft.text);
          if (hex) {
            setDraft(null);
            onCommit(hex);
          } else if (draft.text.trim() === '') {
            setDraft(null);
          } else {
            setDraft({ ...draft, left: true });
          }
        }}
        className={cn('mt-1 w-full rounded-md border bg-surface-2 px-2 py-1 font-mono text-xs text-text-2 outline-none focus:border-violet', invalid ? 'border-red-500' : 'border-border-strong')}
      />
      {invalid && <p className="mt-1 text-xs text-red-500">Usa un color como #0E7A63.</p>}
    </div>
  );
}

/** Los cinco colores de la marca, editables a mano. */
export function PaletteEditor({ value, onChange, disabled }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {PALETTE_KEYS.map((key) => (
        <Swatch key={key} name={key} color={value[key]} disabled={disabled} onCommit={(hex) => onChange({ ...value, [key]: hex })} />
      ))}
    </div>
  );
}
