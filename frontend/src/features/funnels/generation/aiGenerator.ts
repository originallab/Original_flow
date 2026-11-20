import { ApiError } from '@/services/api';
import { generateFunnelPage, type GenerateBrief } from '@/services/funnels';
import { templateOf, TONES, type Brief } from '../catalog';
import type { GeneratedPage, GenerationInput, PageGenerator } from './types';

/** El servidor dice «ahora no hay IA» (cuota agotada o servicio caído): la persona sigue con la plantilla, no se queda sin página. */
const NO_AI_STATUS: readonly number[] = [429, 503];

const clip = (value: string) => value.trim().slice(0, 500);

/** Lo que la persona contó en el asistente y no vive en el funnel; lo vacío no se manda. */
export function briefForAi(brief: Brief): GenerateBrief {
  const tone = TONES.find((t) => t.id === brief.tone)?.name ?? brief.tone;
  const entries = { result: brief.result, objections: brief.objections, tone, callToAction: brief.cta, extra: brief.extra };
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value.trim() !== '').map(([key, value]) => [key, clip(value)]));
}

/**
 * Arma la página con la IA (`POST /funnels/:id/generate`): la IA escribe los bloques y el servidor los valida.
 * La IA arma la página y decide el diseño: la plantilla (salvo que la persona haya elegido una), la paleta y los
 * bloques. Si el negocio tiene paleta de marca, el servidor ya la aplica. Si el servidor dice que no hay
 * IA disponible (503) o que se agotó la cuota (429), se usa el generador de respaldo (la plantilla); cualquier
 * otro error se muestra, porque pedirle a la persona que reintente es mejor que esconder un fallo real.
 */
export function createAiGenerator(fallback: PageGenerator): PageGenerator {
  return {
    id: 'ai',
    async generate(input: GenerationInput, context): Promise<GeneratedPage> {
      let funnel;
      try {
        funnel = await generateFunnelPage(context.token, context.funnel.id, { brief: briefForAi(input.brief), ...(input.images && input.images.length > 0 ? { images: input.images.map((image) => image.id) } : {}) });
      } catch (err) {
        if (err instanceof ApiError && NO_AI_STATUS.includes(err.status)) return fallback.generate(input, context);
        throw err;
      }
      if (funnel.content.blocks.length === 0) return fallback.generate(input, context);

      // Si la persona no eligió plantilla, la elige la IA; si eligió una, se respeta.
      const template = templateOf(input.templateId ?? funnel.designSpec?.template ?? 'claridad');
      return {
        designSpec: {
          template: template.id,
          palette: funnel.designSpec?.palette ?? input.workspace.brandPalette ?? template.palette,
          ...(funnel.designSpec?.fonts ? { fonts: funnel.designSpec.fonts } : {}),
        },
        blocks: funnel.content.blocks,
      };
    },
  };
}
