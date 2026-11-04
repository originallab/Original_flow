import type { Issue } from './blocks/types';

/**
 * El lead que manda el formulario de una página publicada (`POST /public/funnels/:slug/leads`), con
 * las mismas reglas que el backend (schemas/public.schemas.ts). Lo usan el formulario de la página
 * pública para avisar al momento y el modo demostración para responder como el servidor real.
 */
export interface Utm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
}

export type CustomFieldValue = string | number | boolean | null;

export interface LeadBody {
  name?: string;
  email?: string;
  phone?: string;
  consent: boolean;
  utm?: Utm;
  customFields?: Record<string, CustomFieldValue>;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE = /^[0-9+()\-.\s]{6,30}$/;
const FIELD_NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const UTM_LIMITS: Record<keyof Utm, number> = { utm_source: 100, utm_medium: 100, utm_campaign: 100, referrer: 300 };
export const MAX_CUSTOM_FIELDS = 30;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Problemas del lead (vacío si es válido). Las rutas son las mismas que usa el backend: `email`, `consent`, `customFields.x`… */
export function validateLead(body: unknown): Issue[] {
  if (!isObject(body)) return [{ path: [], message: 'Datos inválidos.' }];
  const issues: Issue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });

  const trimmed = (key: string) => (typeof body[key] === 'string' ? (body[key] as string).trim() : undefined);
  if (body.name !== undefined) {
    const name = trimmed('name');
    if (name === undefined || name.length < 1 || name.length > 200) add(['name'], 'Escribe tu nombre (hasta 200 caracteres).');
  }
  const email = body.email === undefined ? undefined : trimmed('email')?.toLowerCase();
  if (body.email !== undefined && (email === undefined || !EMAIL.test(email) || email.length > 254)) add(['email'], 'Escribe un correo válido.');
  const phone = body.phone === undefined ? undefined : trimmed('phone');
  if (body.phone !== undefined && (phone === undefined || !PHONE.test(phone))) add(['phone'], 'Escribe un teléfono válido.');
  if (body.consent !== true) add(['consent'], 'Debes aceptar el tratamiento de tus datos para continuar.');
  if (body.utm !== undefined && !isObject(body.utm)) add(['utm'], 'Datos inválidos.');

  if (body.customFields !== undefined) {
    if (!isObject(body.customFields)) {
      add(['customFields'], 'Datos inválidos.');
    } else {
      const entries = Object.entries(body.customFields);
      if (entries.length > MAX_CUSTOM_FIELDS) add(['customFields'], `Máximo ${MAX_CUSTOM_FIELDS} campos.`);
      for (const [key, value] of entries) {
        if (!FIELD_NAME.test(key)) add(['customFields', key], 'El nombre del campo no es válido.');
        else if (!(value === null || typeof value === 'boolean' || typeof value === 'number' || (typeof value === 'string' && value.length <= 1000))) add(['customFields', key], 'Valor no válido (máximo 1000 caracteres).');
      }
    }
  }

  const hasEmail = body.email !== undefined && !issues.some((i) => i.path[0] === 'email');
  const hasPhone = body.phone !== undefined && !issues.some((i) => i.path[0] === 'phone');
  if (!hasEmail && !hasPhone && !issues.some((i) => i.path[0] === 'email' || i.path[0] === 'phone')) add(['email'], 'Deja un correo o un teléfono para poder contactarte.');
  return issues;
}

/** El lead tal como lo guarda el servidor: recortado, con el correo en minúsculas y solo los UTM permitidos. */
export function normalizeLead(body: LeadBody): { name?: string; email?: string; phone?: string; utm: Utm; customFields: Record<string, CustomFieldValue> } {
  const utm: Utm = {};
  for (const key of Object.keys(UTM_LIMITS) as (keyof Utm)[]) {
    const value = body.utm?.[key];
    if (typeof value === 'string' && value.trim() !== '') utm[key] = value.trim().slice(0, UTM_LIMITS[key]);
  }
  return {
    ...(body.name !== undefined ? { name: body.name.trim() } : {}),
    ...(body.email !== undefined ? { email: body.email.trim().toLowerCase() } : {}),
    ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
    utm,
    customFields: { ...(body.customFields ?? {}) },
  };
}

/** Un campo del formulario de la página (el `content.fields` del bloque «formulario»). */
export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select';
  required: boolean;
  options: string[];
}

const FIELD_TYPES: FormField['type'][] = ['text', 'email', 'tel', 'textarea', 'select'];

/** Lee los campos de un bloque «formulario» sin fiarse de su forma. */
export function formFieldsOf(content: Record<string, unknown>): FormField[] {
  const raw = Array.isArray(content.fields) ? content.fields : [];
  return raw.flatMap((item) => {
    if (!isObject(item) || typeof item.name !== 'string') return [];
    const type = FIELD_TYPES.includes(item.type as FormField['type']) ? (item.type as FormField['type']) : 'text';
    const options = Array.isArray(item.options) ? item.options.filter((o): o is string => typeof o === 'string') : [];
    return [{ name: item.name, label: typeof item.label === 'string' ? item.label : item.name, type, required: item.required === true, options }];
  });
}

const NAME_FIELD = /^(nombre|name|nombre_completo)$/i;

/**
 * Arma el lead con lo que escribió el visitante: el primer campo de tipo correo es el `email`, el
 * primero de teléfono es el `phone`, el llamado «nombre» es el `name` y todo lo demás son `customFields`.
 * Lo vacío no se manda.
 */
export function buildLeadBody(fields: FormField[], values: Record<string, string>, consent: boolean, utm: Utm = {}): LeadBody {
  const body: LeadBody = { consent, utm, customFields: {} };
  let hasEmail = false;
  let hasPhone = false;
  let hasName = false;
  for (const field of fields) {
    const value = (values[field.name] ?? '').trim();
    if (value === '') continue;
    if (field.type === 'email' && !hasEmail) {
      body.email = value;
      hasEmail = true;
    } else if (field.type === 'tel' && !hasPhone) {
      body.phone = value;
      hasPhone = true;
    } else if (!hasName && NAME_FIELD.test(field.name)) {
      body.name = value;
      hasName = true;
    } else {
      body.customFields![field.name] = value;
    }
  }
  return body;
}

/** A qué campo del formulario se refiere un problema del servidor (`email`, `customFields.motivo`…); `null` si es general. */
export function fieldForIssuePath(path: string, fields: FormField[]): string | null {
  const [head, rest] = path.split('.');
  if (head === 'customFields' && rest) return fields.some((f) => f.name === rest) ? rest : null;
  const byType = (type: FormField['type']) => fields.find((f) => f.type === type)?.name ?? null;
  if (head === 'email') return byType('email');
  if (head === 'phone') return byType('tel');
  if (head === 'name') return fields.find((f) => NAME_FIELD.test(f.name))?.name ?? null;
  return null;
}

/** Lo más largo que puede ser el nombre de un lead y el tope de su valor estimado (los mismos que el backend). */
export const MAX_LEAD_NAME = 200;
export const MAX_LEAD_VALUE = 9_999_999_999.99;

/** ¿Es un correo que el backend aceptaría? (recortado, hasta 254 caracteres). */
const validEmail = (value: string) => EMAIL.test(value.trim()) && value.trim().length <= 254;

/** El lead que se da de alta a mano (`POST /leads`). Lleva al menos un correo o un teléfono; no pide consentimiento. */
export interface ManualLeadBody {
  funnelId: string;
  leadStageId?: string;
  name?: string;
  email?: string;
  phone?: string;
  value?: number;
  source?: 'web_form' | 'whatsapp';
}

/** Problemas de un lead dado de alta a mano (vacío si es válido), con las rutas del backend: `funnelId`, `email`, `phone`, `name`, `value`. */
export function validateManualLead(body: ManualLeadBody): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path: [path], message });
  if (!body.funnelId) add('funnelId', 'Elige el funnel del que viene.');
  if (body.name !== undefined && (body.name.trim().length < 1 || body.name.trim().length > MAX_LEAD_NAME)) add('name', `El nombre puede tener hasta ${MAX_LEAD_NAME} caracteres.`);
  if (body.email !== undefined && !validEmail(body.email)) add('email', 'Escribe un correo válido.');
  if (body.phone !== undefined && !PHONE.test(body.phone.trim())) add('phone', 'Escribe un teléfono válido.');
  if (body.email === undefined && body.phone === undefined) add('email', 'Deja un correo o un teléfono para poder contactar a la persona.');
  if (body.value !== undefined && (!Number.isFinite(body.value) || body.value < 0 || body.value > MAX_LEAD_VALUE)) add('value', 'Escribe un número mayor o igual a 0.');
  return issues;
}

/** Los datos de contacto que se corrigen de un lead; con `null` se borra el dato. */
export interface ContactChanges {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Problemas de corregir los datos de un lead (vacío si es válido). El lead siempre conserva un correo o un teléfono. */
export function validateContactChanges(current: { email: string | null; phone: string | null }, changes: ContactChanges): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path: [path], message });
  if (typeof changes.name === 'string' && (changes.name.trim().length < 1 || changes.name.trim().length > MAX_LEAD_NAME)) add('name', `El nombre puede tener hasta ${MAX_LEAD_NAME} caracteres.`);
  if (typeof changes.email === 'string' && !validEmail(changes.email)) add('email', 'Escribe un correo válido.');
  if (typeof changes.phone === 'string' && !PHONE.test(changes.phone.trim())) add('phone', 'Escribe un teléfono válido.');
  const email = changes.email === undefined ? current.email : changes.email;
  const phone = changes.phone === undefined ? current.phone : changes.phone;
  if (!email && !phone && issues.length === 0) add('email', 'El lead debe conservar un correo o un teléfono.');
  return issues;
}
