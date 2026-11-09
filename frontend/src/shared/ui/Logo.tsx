import logo from '@/assets/brand/original-flow-logo.png';
import word from '@/assets/brand/original-flow-logo-word.png';

/**
 * Logotipo completo de Original Flow (el que dice ORIGINAL FLOW, no el isotipo).
 *
 * Reglas de marca, definidas por la persona:
 * - Va arriba a la izquierda en todas las pantallas de la plataforma.
 * - El embudo, FLOW y la línea son MORADOS (#7725BE) siempre, en claro y en oscuro.
 * - SOLO la palabra ORIGINAL cambia con el tema: negra en modo claro y blanca en modo oscuro
 *   (token `--logo-word`).
 * - No cambia de tamaño ni de forma: por eso este componente no recibe props de estilo, tamaño ni color.
 *
 * Son dos capas con las mismas dimensiones: la imagen morada (todo menos la palabra ORIGINAL) y la
 * palabra ORIGINAL como máscara, pintada con el color del tema.
 */
export const LOGO_HEIGHT_PX = 26;
const ASPECT_RATIO = 781 / 116;

const WORD_LAYER = {
  backgroundColor: 'var(--logo-word)',
  maskImage: `url(${word})`,
  WebkitMaskImage: `url(${word})`,
  maskSize: '100% 100%',
  WebkitMaskSize: '100% 100%',
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
} as const;

export function Logo() {
  return (
    <span
      role="img"
      aria-label="Original Flow"
      className="relative block shrink-0 select-none"
      style={{ height: LOGO_HEIGHT_PX, width: Math.round(LOGO_HEIGHT_PX * ASPECT_RATIO) }}
    >
      <img src={logo} alt="" draggable={false} className="absolute inset-0 size-full" />
      <span aria-hidden="true" data-logo-word className="absolute inset-0" style={WORD_LAYER} />
    </span>
  );
}
