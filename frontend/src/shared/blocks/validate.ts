import { BLOCKS, type FieldDef } from './catalog';
import { BLOCK_TYPES, MAX_BLOCKS, type Block, type Issue } from './types';

/**
 * Validación de bloques con las mismas reglas que el backend (schemas/funnel.schemas.ts y
 * funnel-types/blocks.ts). El editor la usa para avisar al momento; el modo demostración, para
 * responder como el servidor real.
 */

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isBlank = (value: unknown) => value === undefined || value === null;

function validUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function checkField(def: FieldDef, value: unknown, path: (string | number)[], issues: Issue[], parent: Record<string, unknown>) {
  const add = (message: string) => issues.push({ path, message });

  switch (def.kind) {
    case 'text': {
      if (isBlank(value)) return def.required ? add('Este campo es obligatorio.') : undefined;
      if (typeof value !== 'string') return add('Debe ser un texto.');
      const trimmed = value.trim();
      if (trimmed === '') return add(def.required ? 'Este campo es obligatorio.' : 'No puede quedar vacío.');
      if (trimmed.length > def.max) return add(`Máximo ${def.max} caracteres.`);
      if (def.pattern && !def.pattern.regex.test(trimmed)) return add(def.pattern.message);
      return;
    }
    case 'url': {
      if (isBlank(value)) return def.required ? add('Este campo es obligatorio.') : undefined;
      if (typeof value !== 'string' || !validUrl(value.trim())) return add('Escribe una dirección válida, por ejemplo https://…');
      return;
    }
    case 'datetime': {
      if (isBlank(value)) return def.required ? add('Elige una fecha y una hora.') : undefined;
      if (typeof value !== 'string' || !ISO_DATETIME.test(value) || Number.isNaN(Date.parse(value))) return add('Elige una fecha y una hora válidas.');
      return;
    }
    case 'number': {
      if (isBlank(value)) return def.required ? add('Este campo es obligatorio.') : undefined;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < def.min) return add(`Debe ser un número, mínimo ${def.min}.`);
      return;
    }
    case 'boolean': {
      if (!isBlank(value) && typeof value !== 'boolean') add('Debe ser sí o no.');
      return;
    }
    case 'select': {
      if (typeof value !== 'string' || !def.options.some((option) => option.value === value)) add('Elige una opción de la lista.');
      return;
    }
    case 'list': {
      if (def.showIf && !def.showIf(parent)) return;
      if (isBlank(value)) return def.min > 0 ? add(`Agrega al menos ${def.min}.`) : undefined;
      if (!Array.isArray(value)) return add('Debe ser una lista.');
      if (value.length < def.min) add(`Agrega al menos ${def.min}.`);
      if (value.length > def.max) add(`Máximo ${def.max}.`);
      value.forEach((item, index) => {
        const itemPath = [...path, index];
        if (def.of.kind === 'text') {
          checkField({ kind: 'text', key: '', label: '', max: def.of.max, required: true }, item, itemPath, issues, parent);
        } else if (!isObject(item)) {
          issues.push({ path: itemPath, message: 'Debe ser un elemento válido.' });
        } else {
          for (const field of def.of.fields) checkField(field, item[field.key], [...itemPath, field.key], issues, item);
        }
      });
      return;
    }
  }
}

/** Problemas del `content` de un bloque según su tipo (vacío si es válido). Las rutas son relativas al `content`. */
export function validateBlockContent(type: Block['type'], content: unknown): Issue[] {
  if (!isObject(content)) return [{ path: [], message: 'El contenido debe ser un objeto.' }];
  const def = BLOCKS[type];
  const issues: Issue[] = [];
  for (const field of def.fields) checkField(field, content[field.key], [field.key], issues, content);
  if (issues.length === 0 && def.refine) issues.push(...def.refine(content));
  return issues;
}

/** Problemas de todos los bloques, con rutas como las del backend: `['blocks', 0, 'content', 'title']`. */
export function validateBlocks(blocks: unknown): Issue[] {
  if (!Array.isArray(blocks)) return [{ path: ['blocks'], message: 'Debe ser una lista de bloques.' }];
  const issues: Issue[] = [];
  if (blocks.length > MAX_BLOCKS) issues.push({ path: ['blocks'], message: `Máximo ${MAX_BLOCKS} bloques.` });
  const seen = new Set<string>();
  blocks.forEach((block: unknown, index) => {
    const at = (...rest: (string | number)[]): (string | number)[] => ['blocks', index, ...rest];
    if (!isObject(block)) return void issues.push({ path: at(), message: 'Bloque inválido.' });
    if (typeof block.key !== 'string' || !KEY_PATTERN.test(block.key)) issues.push({ path: at('key'), message: 'Debe usar minúsculas, números, guion o guion bajo (máx. 50).' });
    else if (seen.has(block.key)) issues.push({ path: at('key'), message: `La clave "${block.key}" está repetida.` });
    else seen.add(block.key);
    if (typeof block.order !== 'number' || !Number.isInteger(block.order) || block.order < 1 || block.order > 1000) issues.push({ path: at('order'), message: 'Debe ser un entero entre 1 y 1000.' });
    if (!isObject(block.content)) issues.push({ path: at('content'), message: 'Debe ser un objeto.' });
    if (block.style !== undefined && !isObject(block.style)) issues.push({ path: at('style'), message: 'Debe ser un objeto.' });
    if (typeof block.type !== 'string' || !(BLOCK_TYPES as readonly string[]).includes(block.type)) {
      issues.push({ path: at('type'), message: 'Tipo de bloque desconocido.' });
    } else if (isObject(block.content)) {
      for (const issue of validateBlockContent(block.type as Block['type'], block.content)) issues.push({ path: at('content', ...issue.path), message: issue.message });
    }
  });
  return issues;
}

/** Los mensajes de cada campo de UN bloque, por ruta («items.0.title»), para mostrarlos junto a su campo. */
export function fieldMessages(issues: Issue[]): Record<string, string> {
  const messages: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.join('.');
    if (!(path in messages)) messages[path] = issue.message;
  }
  return messages;
}
