import { AppError } from '../../lib/errors.js';
import type { AiEngine } from './types.js';

/**
 * El motor de IA mientras no esté integrado: todas las operaciones responden 503 `AI_NOT_CONFIGURED` y no
 * tocan nada. Así los endpoints de IA ya existen y el front puede mostrar «la IA no está disponible» sin
 * romper el flujo con plantilla. Se reemplaza por el cliente real cuando llegue el contrato de Original AI Engine.
 */
export function createUnavailableAiEngine(): AiEngine {
  const unavailable = (): never => {
    throw AppError.serviceUnavailable('AI_NOT_CONFIGURED', 'La generación con IA todavía no está disponible');
  };
  return { generatePage: async () => unavailable(), regenerateBlock: async () => unavailable() };
}
