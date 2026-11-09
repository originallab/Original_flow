/** Funciones puras del editor de campos (fechas, edición de objetos y listas). */

const pad = (n: number) => String(n).padStart(2, '0');

/** De una fecha ISO a lo que entiende `<input type="datetime-local">` (hora local, sin segundos). `''` si no es una fecha. */
export function isoToLocalInput(iso: unknown): string {
  if (typeof iso !== 'string') return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Del valor de un `<input type="datetime-local">` a una fecha ISO en UTC. `undefined` si está vacío o no es válido. */
export function localInputToIso(local: string): string | undefined {
  if (local.trim() === '') return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Copia del objeto con la clave cambiada; con `undefined` la quita (un campo opcional vacío no se guarda). */
export function withKey(object: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  const next = { ...object, [key]: value };
  if (value === undefined) delete next[key];
  return next;
}

/** Copia de la lista con otro elemento en esa posición. */
export const replaceAt = <T,>(items: T[], index: number, value: T): T[] => items.map((item, i) => (i === index ? value : item));

/** Copia de la lista sin el elemento de esa posición. */
export const removeAt = <T,>(items: T[], index: number): T[] => items.filter((_, i) => i !== index);

/** Copia de la lista con el elemento movido `delta` posiciones (o igual si se saldría de los límites). */
export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** ¿Tienen el mismo contenido? (sin importar el orden de las claves de los objetos). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => key in b && deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Una copia profunda de datos JSON. */
export const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
