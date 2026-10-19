import type { BrandPalette, Workspace, WorkspaceChanges } from '@/services/workspaces';

export const PALETTE_KEYS = ['primary', 'secondary', 'accent', 'background', 'text'] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];

export const PALETTE_LABELS: Record<PaletteKey, string> = {
  primary: 'Primario',
  secondary: 'Secundario',
  accent: 'Acento',
  background: 'Fondo',
  text: 'Texto',
};

/** Paleta de partida cuando el negocio todavía no tiene una (la del ejemplo de los mockups). */
export const SUGGESTED_PALETTE: BrandPalette = {
  primary: '#0E7A63',
  secondary: '#0A4A3C',
  accent: '#F2B544',
  background: '#EAF4F0',
  text: '#0F1F1A',
};

/** Acepta `abc`, `#abc`, `aabbcc` o `#aabbcc` en cualquier mayúscula y devuelve `#RRGGBB`, o null si no es un color. */
export function normalizeHex(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) return null;
  const hex = match[1]!.length === 3 ? match[1]!.split('').map((c) => c + c).join('') : match[1]!;
  return `#${hex.toUpperCase()}`;
}

export const INDUSTRIES = [
  { value: 'educacion', label: 'Cursos y educación' },
  { value: 'ecommerce', label: 'Ecommerce' },
  { value: 'servicios', label: 'Servicios profesionales' },
  { value: 'eventos', label: 'Eventos y webinars' },
  { value: 'tecnologia', label: 'SaaS / tecnología' },
  { value: 'otro', label: 'Otro' },
] as const;

export interface BusinessValues {
  name: string;
  country: string;
  website: string;
  industry: string;
}

export function valuesOf(workspace: Workspace | null): BusinessValues {
  return {
    name: workspace?.name ?? '',
    country: workspace?.country ?? '',
    website: workspace?.website ?? '',
    industry: workspace?.industry ?? '',
  };
}

const samePalette = (a: BrandPalette | null, b: BrandPalette | null) =>
  a === b || (a !== null && b !== null && PALETTE_KEYS.every((key) => a[key].toUpperCase() === b[key].toUpperCase()));

/**
 * El cuerpo del PATCH: solo lo que cambió. Un campo opcional que se deja vacío se manda como `null`
 * (se borra). Devuelve `{}` si no cambió nada.
 */
export function diffWorkspace(original: Workspace, values: BusinessValues, palette: BrandPalette | null): WorkspaceChanges {
  const changes: WorkspaceChanges = {};
  const name = values.name.trim();
  if (name !== original.name) changes.name = name;
  for (const key of ['country', 'website', 'industry'] as const) {
    const next = values[key].trim();
    const before = original[key] ?? '';
    if (next !== before) changes[key] = next === '' ? null : next;
  }
  if (!samePalette(original.brandPalette, palette)) changes.brandPalette = palette;
  return changes;
}
