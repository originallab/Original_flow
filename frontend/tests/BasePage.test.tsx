import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BasePage } from '@/pages/BasePage';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';

const montar = () =>
  render(
    <ThemeProvider>
      <BasePage />
    </ThemeProvider>,
  );

describe('BasePage', () => {
  it('el logotipo completo va arriba a la izquierda, como primer elemento del encabezado', () => {
    montar();
    const encabezado = screen.getByRole('banner');
    const primero = encabezado.firstElementChild;
    expect(primero).toBe(within(encabezado).getByRole('img', { name: 'Original Flow' }));
  });

  it('el botón de tema cambia el modo de toda la pantalla', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: /modo oscuro/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
