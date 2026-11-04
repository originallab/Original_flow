import { describe, expect, it } from 'vitest';
import { MAX_LEAD_NAME, MAX_LEAD_VALUE, validateContactChanges, validateManualLead } from '@/shared/leads';

const campos = (issues: { path: (string | number)[] }[]) => issues.map((issue) => issue.path[0]).sort();
const base = { funnelId: 'f1' };

describe('validateManualLead (alta de un lead a mano)', () => {
  it('con solo un correo, solo un teléfono o ambos es válido', () => {
    expect(validateManualLead({ ...base, email: 'ana@correo.com' })).toEqual([]);
    expect(validateManualLead({ ...base, phone: '+52 618 111 2233' })).toEqual([]);
    expect(validateManualLead({ ...base, name: 'Ana', email: ' ana@correo.com ', phone: '(618) 111-2233', value: 0 })).toEqual([]);
  });

  it('exige el funnel y un correo o un teléfono', () => {
    expect(campos(validateManualLead({ funnelId: '', email: 'ana@correo.com' }))).toEqual(['funnelId']);
    const sinContacto = validateManualLead({ ...base, name: 'Ana' });
    expect(campos(sinContacto)).toEqual(['email']);
    expect(sinContacto[0]?.message).toMatch(/correo o un teléfono/i);
  });

  it('valida cada dato con las mismas reglas del servidor', () => {
    expect(campos(validateManualLead({ ...base, email: 'no-es-correo' }))).toEqual(['email']);
    expect(campos(validateManualLead({ ...base, email: `${'a'.repeat(250)}@x.com` }))).toEqual(['email']);
    expect(campos(validateManualLead({ ...base, phone: 'abc' }))).toEqual(['phone']);
    expect(campos(validateManualLead({ ...base, phone: '123' }))).toEqual(['phone']);
    expect(campos(validateManualLead({ ...base, email: 'a@correo.com', name: '   ' }))).toEqual(['name']);
    expect(campos(validateManualLead({ ...base, email: 'a@correo.com', name: 'a'.repeat(MAX_LEAD_NAME + 1) }))).toEqual(['name']);
    expect(validateManualLead({ ...base, email: 'a@correo.com', name: 'a'.repeat(MAX_LEAD_NAME) })).toEqual([]);
  });

  it('el valor estimado va de 0 al tope; no admite negativos ni cosas que no son números', () => {
    expect(campos(validateManualLead({ ...base, email: 'a@correo.com', value: -1 }))).toEqual(['value']);
    expect(campos(validateManualLead({ ...base, email: 'a@correo.com', value: Number.NaN }))).toEqual(['value']);
    expect(campos(validateManualLead({ ...base, email: 'a@correo.com', value: MAX_LEAD_VALUE + 1 }))).toEqual(['value']);
    expect(validateManualLead({ ...base, email: 'a@correo.com', value: MAX_LEAD_VALUE })).toEqual([]);
  });

  it('junta todos los problemas a la vez', () => {
    expect(campos(validateManualLead({ funnelId: '', email: 'no', name: ' ', value: -5 }))).toEqual(['email', 'funnelId', 'name', 'value']);
  });
});

describe('validateContactChanges (corregir los datos de un lead)', () => {
  const lead = { email: 'ana@correo.com' as string | null, phone: '618 111 2233' as string | null };

  it('un cambio válido, o un dato que se borra mientras queda otro, es válido', () => {
    expect(validateContactChanges(lead, { name: 'Ana Pérez' })).toEqual([]);
    expect(validateContactChanges(lead, { email: 'otra@correo.com' })).toEqual([]);
    expect(validateContactChanges(lead, { email: null })).toEqual([]);
    expect(validateContactChanges(lead, { phone: null })).toEqual([]);
    expect(validateContactChanges(lead, { name: null })).toEqual([]);
  });

  it('no deja al lead sin correo ni teléfono', () => {
    const sinNada = validateContactChanges(lead, { email: null, phone: null });
    expect(campos(sinNada)).toEqual(['email']);
    expect(sinNada[0]?.message).toMatch(/conservar/i);
    expect(campos(validateContactChanges({ email: 'a@correo.com', phone: null }, { email: null }))).toEqual(['email']);
    expect(campos(validateContactChanges({ email: null, phone: '618 111 2233' }, { phone: null }))).toEqual(['email']);
    // Si borra uno pero escribe el otro, queda con contacto.
    expect(validateContactChanges({ email: 'a@correo.com', phone: null }, { email: null, phone: '618 111 2233' })).toEqual([]);
  });

  it('valida el formato de lo que se escribe', () => {
    expect(campos(validateContactChanges(lead, { email: 'no-es-correo' }))).toEqual(['email']);
    expect(campos(validateContactChanges(lead, { phone: 'abc' }))).toEqual(['phone']);
    expect(campos(validateContactChanges(lead, { name: '' }))).toEqual(['name']);
    expect(campos(validateContactChanges(lead, { name: 'a'.repeat(MAX_LEAD_NAME + 1) }))).toEqual(['name']);
    expect(campos(validateContactChanges(lead, { email: 'x', phone: 'y', name: ' ' }))).toEqual(['email', 'name', 'phone']);
  });

  it('un lead que ya no tiene contacto y no cambia nada de contacto no estorba al guardar otros datos', () => {
    // Cambiar solo el nombre de un lead cuyo contacto ya está completo; con contacto vacío sí avisa (no debería pasar).
    expect(campos(validateContactChanges({ email: null, phone: null }, { name: 'Ana' }))).toEqual(['email']);
  });
});
