import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { mockSystemDark } from './helpers';

const montar = () =>
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
const tema = () => document.documentElement.getAttribute('data-theme');

describe('tema claro y oscuro', () => {
  it('sin preferencia guardada sigue el modo del sistema', () => {
    mockSystemDark(true);
    montar();
    expect(tema()).toBe('dark');
  });

  it('el botón alterna entre claro y oscuro y guarda la preferencia', async () => {
    montar();
    expect(tema()).toBe('light');
    await userEvent.click(screen.getByRole('button', { name: /modo oscuro/i }));
    expect(tema()).toBe('dark');
    expect(localStorage.getItem('of-theme')).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: /modo claro/i }));
    expect(tema()).toBe('light');
    expect(localStorage.getItem('of-theme')).toBe('light');
  });

  it('la preferencia guardada manda sobre la del sistema', () => {
    mockSystemDark(true);
    localStorage.setItem('of-theme', 'light');
    montar();
    expect(tema()).toBe('light');
  });

  it('ignora un valor guardado inválido', () => {
    localStorage.setItem('of-theme', 'azul');
    montar();
    expect(tema()).toBe('light');
  });

  it('sigue funcionando si el almacenamiento del navegador no está disponible', async () => {
    const espiaLeer = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const espiaEscribir = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    montar();
    await userEvent.click(screen.getByRole('button', { name: /modo oscuro/i }));
    expect(tema()).toBe('dark');
    espiaLeer.mockRestore();
    espiaEscribir.mockRestore();
  });
});
