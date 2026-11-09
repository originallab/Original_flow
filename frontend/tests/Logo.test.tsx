import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo, LOGO_HEIGHT_PX } from '@/shared/ui/Logo';
import { ThemeProvider, useTheme } from '@/shared/theme/ThemeProvider';

const capas = (contenedor: HTMLElement) => ({
  imagen: contenedor.querySelector('img') as HTMLImageElement,
  palabra: contenedor.querySelector('[data-logo-word]') as HTMLElement,
});

describe('Logo', () => {
  it('muestra el logotipo completo de Original Flow con su texto alternativo', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'Original Flow' })).toBeInTheDocument();
  });

  it('tiene siempre el mismo tamaño', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'Original Flow' })).toHaveStyle({ height: `${LOGO_HEIGHT_PX}px` });
  });

  it('la palabra ORIGINAL se pinta con el color del tema (--logo-word); lo demás es la imagen morada fija', () => {
    const { container } = render(<Logo />);
    const { imagen, palabra } = capas(container);
    expect(palabra).toHaveStyle({ backgroundColor: 'var(--logo-word)' });
    expect(imagen.getAttribute('src')).toBeTruthy();
    expect(palabra).toHaveAttribute('aria-hidden', 'true');
  });

  it('la imagen morada y el tamaño son exactamente los mismos en modo claro y en modo oscuro', () => {
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
    const srcClaro = capas(claro.container).imagen.getAttribute('src');
    claro.unmount();
    const oscuro = render(
      <ThemeProvider>
        <Probe modo="dark" />
      </ThemeProvider>,
    );
    expect(capas(oscuro.container).imagen.getAttribute('src')).toBe(srcClaro);
    expect(oscuro.getByRole('img', { name: 'Original Flow' })).toHaveStyle({ height: `${LOGO_HEIGHT_PX}px` });
  });

  it('no acepta propiedades de tamaño ni de color (el logo no se puede cambiar)', () => {
    // @ts-expect-error el logo no recibe `size`
    render(<Logo size={80} />);
    // @ts-expect-error el logo no recibe `color`
    render(<Logo color="green" />);
    for (const logo of screen.getAllByRole('img', { name: 'Original Flow' })) {
      expect(logo).toHaveStyle({ height: `${LOGO_HEIGHT_PX}px` });
    }
  });
});
