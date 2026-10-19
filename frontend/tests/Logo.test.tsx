import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo, LOGO_HEIGHT_PX } from '@/shared/ui/Logo';
import { ThemeProvider, useTheme } from '@/shared/theme/ThemeProvider';

describe('Logo', () => {
  it('muestra el logotipo completo de Original Flow con su texto alternativo', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'Original Flow' })).toBeInTheDocument();
  });

  it('tiene siempre el mismo tamaño', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'Original Flow' })).toHaveStyle({ height: `${LOGO_HEIGHT_PX}px` });
  });

  it('es exactamente la misma imagen en modo claro y en modo oscuro', () => {
    function Probe({ modo }: { modo: 'light' | 'dark' }) {
      const { setChoice } = useTheme();
      setChoice(modo);
      return <Logo />;
    }
    const claro = render(
      <ThemeProvider>
        <Probe modo="light" />
      </ThemeProvider>,
    );
    const srcClaro = claro.getByRole('img').getAttribute('src');
    claro.unmount();
    const oscuro = render(
      <ThemeProvider>
        <Probe modo="dark" />
      </ThemeProvider>,
    );
    expect(oscuro.getByRole('img').getAttribute('src')).toBe(srcClaro);
    expect(oscuro.getByRole('img')).toHaveStyle({ height: `${LOGO_HEIGHT_PX}px` });
  });

  it('no acepta propiedades de tamaño ni de color (el logo no se puede cambiar)', () => {
    // @ts-expect-error el logo no recibe `size`
    render(<Logo size={80} />);
    // @ts-expect-error el logo no recibe `color`
    render(<Logo color="green" />);
    for (const logo of screen.getAllByRole('img', { name: 'Original Flow' })) {
      expect(logo).toHaveStyle({ height: `${LOGO_HEIGHT_PX}px` });
      expect(logo).not.toHaveStyle({ color: 'green' });
    }
  });
});
