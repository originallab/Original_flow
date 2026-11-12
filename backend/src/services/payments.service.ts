import type { Prisma } from '../generated/prisma/client.js';
import type { AppConfig } from '../config/index.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { WorkspaceModel } from '../models/workspace.model.js';
import { storedPaymentConfigSchema, type ConnectPaymentsBody } from '../schemas/payments.schemas.js';
import type { AccessService } from './access.service.js';
import type { AuditService } from './audit.service.js';
import type { RequestContext } from './auth.service.js';
import { assertCan } from './permissions.js';

export interface PaymentsStatus {
  connected: boolean;
  provider?: 'original_pay';
  currency?: string;
  methods?: string[];
}

export interface PaymentCredentials {
  apiKey: string;
  currency: string;
  methods: string[];
}

interface Deps {
  config: AppConfig;
  logger: Logger;
  workspaces: WorkspaceModel;
  access: AccessService;
  audit: AuditService;
}

/**
 * Conexión de un workspace con Original Pay. La apikey se guarda cifrada (AES-256-GCM) y solo se
 * descifra en el momento de llamar a Original Pay: ni la API ni los logs la devuelven jamás.
 */
export function createPaymentsService({ config, logger, workspaces, access, audit }: Deps) {
  function encryptionKey(): string {
    if (!config.paymentConfigEncryptionKey) {
      throw AppError.serviceUnavailable('PAYMENTS_NOT_CONFIGURED', 'El servidor no tiene configurada la clave para guardar llaves de pago');
    }
    return config.paymentConfigEncryptionKey;
  }

  async function loadManaged(userId: string, workspaceId: string) {
    const resolved = await access.resolve(userId, workspaceId);
    if (!resolved) throw AppError.notFound('WORKSPACE_NOT_FOUND', 'Workspace no encontrado');
    assertCan(resolved.role, 'payments:manage');
    return resolved;
  }

  async function readStored(workspaceId: string) {
    const parsed = storedPaymentConfigSchema.safeParse(await workspaces.findPaymentConfig(workspaceId));
    return parsed.success ? parsed.data : null;
  }

  function toStatus(stored: Awaited<ReturnType<typeof readStored>>): PaymentsStatus {
    return stored ? { connected: true, provider: stored.provider, currency: stored.currency, methods: stored.methods } : { connected: false };
  }

  return {
    /** PUT /workspaces/:id/payments: conecta (o reemplaza la conexión de) Original Pay. */
    async connect(userId: string, workspaceId: string, body: ConnectPaymentsBody, ctx: RequestContext): Promise<PaymentsStatus> {
      await loadManaged(userId, workspaceId);
      const stored = {
        provider: 'original_pay' as const,
        apiKeyEnc: encryptSecret(body.apiKey, encryptionKey()),
        currency: body.currency,
        methods: body.methods,
      };
      await workspaces.setPaymentConfig(workspaceId, stored as Prisma.InputJsonValue);
      await audit.record({
        action: 'payments.connect',
        resourceType: 'workspace',
        resourceId: workspaceId,
        workspaceId,
        userId,
        ip: ctx.ip,
        metadata: { currency: body.currency, methods: body.methods },
      });
      return toStatus(stored);
    },

    /** GET /workspaces/:id/payments: estado de la conexión. Nunca devuelve la llave. */
    async getStatus(userId: string, workspaceId: string): Promise<PaymentsStatus> {
      await loadManaged(userId, workspaceId);
      return toStatus(await readStored(workspaceId));
    },

    /** Para los servicios de cobro: la apikey ya descifrada, o null si el workspace no conectó pagos. */
    async credentialsFor(workspaceId: string): Promise<PaymentCredentials | null> {
      const stored = await readStored(workspaceId);
      if (!stored) return null;
      try {
        return { apiKey: decryptSecret(stored.apiKeyEnc, encryptionKey()), currency: stored.currency, methods: stored.methods };
      } catch (err) {
        if (err instanceof AppError) throw err;
        // Clave de cifrado distinta a la usada al guardar, o dato alterado.
        logger.error('no se pudo descifrar la apikey de pagos del workspace', { workspaceId });
        throw AppError.serviceUnavailable('PAYMENTS_MISCONFIGURED', 'La conexión de pagos del negocio no es válida; vuelve a conectarla');
      }
    },
  };
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;
