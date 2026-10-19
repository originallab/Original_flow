import { describe, expect, it } from 'vitest';
import { diffWorkspace, normalizeHex, SUGGESTED_PALETTE, valuesOf } from '@/features/workspaces/brand';
import { ApiError } from '@/services/api';
import type { BrandPalette } from '@/services/workspaces';
import { canManageWorkspace } from '@/shared/utils/permissions';
import { workspaceFixture } from './helpers/fakeBackend';

describe('normalizeHex', () => {
  it.each([
    ['#0e7a63', '#0E7A63'],
    ['0E7A63', '#0E7A63'],
    ['  #abc ', '#AABBCC'],
    ['fff', '#FFFFFF'],
  ])('acepta %s y lo normaliza a %s', (entrada, esperado) => {
    expect(normalizeHex(entrada)).toBe(esperado);
  });

  it.each(['', '#', '#12', '#12345', '#1234567', '#ggg', 'rojo', '#0e7a6g'])('rechaza %j', (entrada) => {
    expect(normalizeHex(entrada)).toBeNull();
  });
});

describe('diffWorkspace', () => {
  const paleta: BrandPalette = { ...SUGGESTED_PALETTE };
  const original = workspaceFixture({ name: 'Nimbral', country: 'México', website: 'https://nimbral.test', industry: 'educacion', brandPalette: paleta });
  const sinCambios = () => valuesOf(original);

  it('sin cambios devuelve un objeto vacío (no hay nada que mandar)', () => {
    expect(diffWorkspace(original, sinCambios(), paleta)).toEqual({});
  });

  it('manda solo los campos que cambiaron', () => {
    expect(diffWorkspace(original, { ...sinCambios(), name: 'Nimbral Pro' }, paleta)).toEqual({ name: 'Nimbral Pro' });
  });

  it('recorta los espacios del nombre y no lo manda si solo cambiaron los espacios', () => {
    expect(diffWorkspace(original, { ...sinCambios(), name: '  Nimbral  ' }, paleta)).toEqual({});
  });

  it('un campo opcional que se deja vacío se manda como null para borrarlo', () => {
    expect(diffWorkspace(original, { ...sinCambios(), website: '', country: ' ' }, paleta)).toEqual({ website: null, country: null });
  });

  it('un campo opcional que antes estaba vacío y sigue vacío no cuenta como cambio', () => {
    const vacio = workspaceFixture({ website: null, industry: null, country: null, brandPalette: null });
    expect(diffWorkspace(vacio, valuesOf(vacio), null)).toEqual({});
  });

  it('compara la paleta sin distinguir mayúsculas, color por color', () => {
    const minusculas = Object.fromEntries(Object.entries(paleta).map(([k, v]) => [k, v.toLowerCase()])) as unknown as BrandPalette;
    expect(diffWorkspace(original, sinCambios(), minusculas)).toEqual({});
    expect(diffWorkspace(original, sinCambios(), { ...paleta, accent: '#000000' })).toEqual({ brandPalette: { ...paleta, accent: '#000000' } });
  });

  it('un negocio sin paleta que recibe una la manda completa', () => {
    const sinPaleta = workspaceFixture({ brandPalette: null });
    expect(diffWorkspace(sinPaleta, valuesOf(sinPaleta), paleta)).toEqual({ brandPalette: paleta });
  });
});

describe('ApiError.fieldErrors', () => {
  const error = (details: unknown) => new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', details, 'req_1');

  it('convierte details [{ path, message }] en un mensaje por campo', () => {
    expect(
      error([
        { path: 'name', message: 'Requerido' },
        { path: 'brandPalette.primary', message: 'Color inválido' },
      ]).fieldErrors(),
    ).toEqual({ name: 'Requerido', 'brandPalette.primary': 'Color inválido' });
  });

  it('si un campo trae varios errores se queda con el primero', () => {
    expect(
      error([
        { path: 'name', message: 'Primero' },
        { path: 'name', message: 'Segundo' },
      ]).fieldErrors(),
    ).toEqual({ name: 'Primero' });
  });

  it.each([[{}], [null], ['texto'], [[{ path: 3, message: 'x' }, null]]])('con details %j no inventa errores', (details) => {
    expect(error(details).fieldErrors()).toEqual({});
  });
});

describe('permisos del negocio', () => {
  it.each([
    ['super_admin', true],
    ['client_admin', true],
    ['marketing_manager', false],
    ['disenador', false],
    ['vendedor', false],
    ['analista', false],
    [undefined, false],
    ['', false],
  ])('canManageWorkspace(%s) = %s', (rol, esperado) => {
    expect(canManageWorkspace(rol)).toBe(esperado);
  });
});
