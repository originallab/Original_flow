import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
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

/** Lo que el negocio habilitó para cobrar. */
export interface PaymentSettings {
  currency: string;
  methods: string[];
}

interface Deps {
  workspaces: WorkspaceModel;
  access: AccessService;
  audit: AuditService;
}

/**
 * Habilitar el cobro con Original Pay en un workspace (divisa y métodos). Las credenciales de la app de
 * Original Pay son del servidor (`ORIGINALPAY_TOKEN_APP`), no de cada negocio.
 */
export function createPaymentsService({ workspaces, access, audit }: Deps) {
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
    /** PUT /workspaces/:id/payments: habilita (o reemplaza la configuración de) Original Pay. */
    async connect(userId: string, workspaceId: string, body: ConnectPaymentsBody, ctx: RequestContext): Promise<PaymentsStatus> {
      await loadManaged(userId, workspaceId);
      const stored = {
        provider: 'original_pay' as const,
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

    /** GET /workspaces/:id/payments: estado de la conexión. */
    async getStatus(userId: string, workspaceId: string): Promise<PaymentsStatus> {
      await loadManaged(userId, workspaceId);
      return toStatus(await readStored(workspaceId));
    },

    /** Para el cobro: lo que el negocio habilitó, o null si no habilitó pagos. */
    async settingsFor(workspaceId: string): Promise<PaymentSettings | null> {
      const stored = await readStored(workspaceId);
      return stored ? { currency: stored.currency, methods: stored.methods } : null;
    },
  };
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;
