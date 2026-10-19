import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(import.meta.dirname, '../src/index.css'), 'utf-8');
const bloque = (selector: string) => css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)));
const valor = (b: string, token: string) => /#([0-9a-f]{6})/i.exec(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i').exec(b)?.[1] ?? '')?.[0];
const brillo = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};

describe('tokens de diseño', () => {
  const claro = bloque(':root {');
  const oscuro = bloque("[data-theme='dark'] {");

  it('el morado de la marca es #7725BE y el modo oscuro no lo redefine (el logo nunca cambia de color)', () => {
    expect(claro).toContain('--brand: #7725be');
    expect(oscuro).not.toContain('--brand');
    expect(oscuro).not.toContain('--violet:');
  });

  it('la palabra ORIGINAL del logo es negra en modo claro y blanca en modo oscuro', () => {
    expect(claro).toContain('--logo-word: #000000');
    expect(oscuro).toContain('--logo-word: #ffffff');
  });

  it('el fondo oscuro es un poco más claro que el del diseño original (#0A090E), pero sigue siendo oscuro', () => {
    const fondo = valor(oscuro, '--bg');
    expect(fondo).toBeDefined();
    expect(brillo(fondo!)).toBeGreaterThan(brillo('#0a090e'));
    expect(brillo(fondo!)).toBeLessThan(40);
  });

  it('en modo oscuro las superficies siguen siendo más claras que el fondo (se conserva la jerarquía)', () => {
    expect(brillo(valor(oscuro, '--surface')!)).toBeGreaterThan(brillo(valor(oscuro, '--bg')!));
    expect(brillo(valor(oscuro, '--surface-2')!)).toBeGreaterThan(brillo(valor(oscuro, '--surface')!));
  });
});
