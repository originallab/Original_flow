import logo from '@/assets/brand/original-flow-logo.png';

/**
 * Logotipo completo de Original Flow (el que dice ORIGINAL FLOW, no el isotipo).
 *
 * Regla de marca: va arriba a la izquierda en todas las pantallas de la plataforma y es MORADO
 * SIEMPRE, en claro y en oscuro. No cambia de color, tamaño ni forma: por eso este componente
 * no recibe props de estilo, tamaño ni color. La imagen ya es morada (#7725BE) con fondo transparente.
 */
export const LOGO_HEIGHT_PX = 26;

export function Logo() {
  return (
    <img
      src={logo}
      alt="Original Flow"
      draggable={false}
      style={{ height: LOGO_HEIGHT_PX, width: 'auto' }}
      className="block shrink-0 select-none"
    />
  );
}
