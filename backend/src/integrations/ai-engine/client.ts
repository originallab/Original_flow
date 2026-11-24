import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import type { OperationLogService } from '../../services/operationLog.service.js';
import { extractJsonObject } from './json.js';
import { generatePageMessages, regenerateBlockMessages, type ChatMessage } from './prompts.js';
import { signRequest } from './signing.js';
import type { AiContext, AiEngine } from './types.js';

interface Deps {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  /** El modelo del gateway (por ejemplo `gpt-5.4-mini`): `model` es obligatorio en chat completions. */
  model: string;
  /** Una página completa puede tardar decenas de segundos. */
  timeoutMs: number;
  logger: Logger;
  operationLog: OperationLogService;
  /** Inyectables para probar sin red y con un reloj fijo. */
  fetchFn?: typeof fetch;
  now?: () => number;
}

const PATH = '/v1/chat/completions';

const chatResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }), finish_reason: z.string().nullable().optional() })).min(1),
});

/** Sin respuesta (red, tiempo agotado) o un 5xx. */
class TransientError extends Error {}

/**
 * Cliente de IA Engine (gateway de IA de The Original Lab): chat completions firmado con HMAC-SHA256. Pide
 * JSON, lo extrae de la respuesta (el gateway no tiene «modo JSON») y lo devuelve SIN validar: el servicio de
 * generación lo valida con las reglas del editor. Cada llamada va etiquetada con `metadata` (acción, negocio y
 * petición; nunca datos personales) para desglosar el costo por cliente, y queda en el log operativo. Ni las
 * llaves ni los textos de la persona se escriben en los logs.
 */
/** Temperatura (0 a 2) al generar una página: más alta que la normal para que el diseño y la estructura varíen entre páginas. */
export const PAGE_TEMPERATURE = 1.15;

export function createAiEngineClient({ baseUrl, apiKey, secretKey, model, timeoutMs, logger, operationLog, fetchFn = fetch, now = Date.now }: Deps): AiEngine {
  const root = baseUrl.replace(/\/+$/, '');

  /** Una petición al gateway; devuelve el texto de la respuesta del modelo. */
  async function chatOnce(ctx: AiContext, messages: ChatMessage[], temperature?: number): Promise<{ text: string; truncated: boolean }> {
    const body = new TextEncoder().encode(
      JSON.stringify({
        model,
        messages,
        ...(temperature === undefined ? {} : { temperature }),
        // Etiquetas para el costo por cliente: solo ids y la acción, sin datos personales.
        metadata: { app: 'original-flow', action: ctx.action, workspace_id: ctx.workspaceId, request_id: ctx.requestId },
      }),
    );
    const timestamp = Math.floor(now() / 1000);
    let response: Response;
    try {
      response = await fetchFn(`${root}${PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Api-Key': apiKey,
          'X-Timestamp': String(timestamp),
          'X-Signature': signRequest(secretKey, 'POST', PATH, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new TransientError('sin respuesta de IA Engine');
    }

    // Algunos modelos solo aceptan la temperatura de fábrica: si la rechaza (400), se repite la misma petición sin ella.
    if (response.status === 400 && temperature !== undefined) return chatOnce(ctx, messages);
    if (response.status >= 500) throw new TransientError(`IA Engine respondió ${response.status}`);
    if (response.status === 429) throw AppError.tooManyRequests('AI_QUOTA_EXCEEDED', 'Se alcanzó la cuota de IA; intenta más tarde');
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      // Llaves o reloj incorrectos, o proyecto desactivado: lo arregla quien administra el servidor, no la persona.
      logger.warn('IA Engine rechazó las credenciales del proyecto', { status: response.status });
      throw AppError.serviceUnavailable('AI_MISCONFIGURED', 'No se pudo autenticar con la IA; revisa las credenciales del servidor');
    }
    if (!response.ok) throw AppError.serviceUnavailable('AI_UNAVAILABLE', 'La IA rechazó la petición');

    const parsed = chatResponse.safeParse(await response.json().catch(() => null));
    const choice = parsed.success ? parsed.data.choices[0] : undefined;
    if (!choice?.message.content) throw AppError.serviceUnavailable('AI_BAD_RESPONSE', 'La IA devolvió una respuesta que no se puede usar; intenta de nuevo');
    return { text: choice.message.content, truncated: choice.finish_reason === 'length' };
  }

  /** Pide JSON; si la respuesta viene cortada o no es JSON, repite UNA vez (el modelo a veces se desvía). */
  function askJson(ctx: AiContext, operation: string, messages: ChatMessage[], temperature?: number): Promise<unknown> {
    return operationLog.track(
      { requestId: ctx.requestId, service: 'ia-engine', operation, workspaceId: ctx.workspaceId },
      async () => {
        try {
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const { text, truncated } = await chatOnce(ctx, messages, temperature);
            const value = truncated ? undefined : extractJsonObject(text);
            if (value !== undefined) return value;
          }
          throw AppError.serviceUnavailable('AI_BAD_RESPONSE', 'La IA devolvió una respuesta que no se puede usar; intenta de nuevo');
        } catch (err) {
          if (err instanceof TransientError) throw AppError.serviceUnavailable('AI_UNAVAILABLE', 'La IA no responde en este momento; intenta de nuevo');
          throw err;
        }
      },
      (err) => (err instanceof AppError ? err.code : 'UNKNOWN'),
    );
  }

  return {
    // Al diseñar una página se pide más creatividad que la de siempre: con la temperatura por defecto el modelo tiende a repetir lo «seguro».
    generatePage: (ctx, input) => askJson(ctx, 'generate_page', generatePageMessages(input), PAGE_TEMPERATURE),
    regenerateBlock: (ctx, input) => askJson(ctx, 'regenerate_block', regenerateBlockMessages(input)),
  };
}
