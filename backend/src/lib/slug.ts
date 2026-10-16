import { randomBytes } from 'node:crypto';

/** Forma válida de un slug: minúsculas, números y guiones sueltos entre palabras. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Convierte un nombre en un slug: sin acentos, en minúsculas y con guiones. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return base.length >= 3 ? base : 'funnel';
}

/** Sufijo corto aleatorio para desempatar cuando el slug ya existe. */
export function randomSuffix(): string {
  return randomBytes(2).toString('hex');
}
