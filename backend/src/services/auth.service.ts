import { randomUUID } from 'node:crypto';
import type { Session, User } from '../generated/prisma/client.js';
import type { AppConfig } from '../config/index.js';
import { safeEqual } from '../lib/safeEqual.js';
import type { Logger } from '../lib/logger.js';
import type { MembershipModel } from '../models/membership.model.js';
import type { SessionModel } from '../models/session.model.js';
import type { UserModel } from '../models/user.model.js';
import type { CallbackBody } from '../schemas/auth.schemas.js';
import type { AuditService } from './audit.service.js';

/** Datos de la petición que el servicio necesita sin conocer HTTP. */
export interface RequestContext {
  ip?: string;
  requestId: string;
}

export interface AuthContext {
  userId: string;
  sessionToken: string;
}

export type ValidateResult =
  | { validated: 0 }
  | { validated: 1; userId: string; email: string; profileComplete: boolean };

interface Deps {
  config: AppConfig;
  logger: Logger;
  sessions: SessionModel;
  users: UserModel;
  memberships: MembershipModel;
  audit: AuditService;
}

export function createAuthService(deps: Deps) {
  const { config, logger, sessions, users, memberships, audit } = deps;

  /** Una sesión sin validar caduca pronto; una validada, más tarde. Ambas se cuentan desde su creación. */
  function isExpired(session: Session): boolean {
    const ttl = session.validated ? config.session.ttlMs : config.session.pendingTtlMs;
    return Date.now() - session.createdAt.getTime() > ttl;
  }

  /** La sesión validada y vigente de un token, o null. */
  async function findActiveSession(token: string): Promise<(Session & { userId: string }) | null> {
    const session = await sessions.findByToken(token);
    if (!session || !session.validated || !session.userId || isExpired(session)) return null;
    return { ...session, userId: session.userId };
  }

  return {
    /** GET /auth/session: crea una sesión sin validar. */
    async createSession(): Promise<{ session: string }> {
      const token = randomUUID();
      await sessions.create(token);
      return { session: token };
    },

    /**
     * POST /auth/callback: Original Auth avisa que la persona se autenticó.
     * Responde siempre `validated` 1 o 0 (nunca un error HTTP por secretos o sesión
     * inválidos): es el patrón observado y no se sabe cómo reaccionaría Original Auth
     * ante un 4xx. Es idempotente: un reintento no duplica usuario ni sesión.
     */
    async handleCallback(body: CallbackBody, ctx: RequestContext): Promise<{ validated: 0 | 1 }> {
      const secretsOk =
        safeEqual(body.token_app, config.originalAuth.tokenApp) &&
        safeEqual(body.secret_key, config.originalAuth.secretKey);
      if (!secretsOk) {
        logger.warn('callback de Original Auth con secretos inválidos', { requestId: ctx.requestId, ip: ctx.ip });
        return { validated: 0 };
      }

      const session = await sessions.findByToken(body.session);
      if (!session || isExpired(session)) {
        logger.warn('callback de Original Auth para una sesión desconocida o vencida', { requestId: ctx.requestId });
        return { validated: 0 };
      }

      if (session.validated) {
        // Reintento del mismo callback: sigue validada. Pero una sesión ya validada
        // nunca se reasigna a otra persona.
        const owner = session.userId ? await users.findById(session.userId) : null;
        return { validated: owner?.email === body.email ? 1 : 0 };
      }

      const { user, created } = await users.findOrCreateByEmail(body.email, body.name);
      await sessions.markValidated(session.token, user.id);

      // Si alguien la había invitado a un equipo con este correo, la invitación se activa ahora.
      const linked = await memberships.linkPendingInvitations(user.email, user.id);
      for (const invitation of linked) {
        await audit.record({
          action: 'member.accept',
          resourceType: 'membership',
          resourceId: invitation.id,
          workspaceId: invitation.workspaceId ?? undefined,
          userId: user.id,
          ip: ctx.ip,
        });
      }

      if (created) {
        await audit.record({ action: 'auth.register', resourceType: 'user', resourceId: user.id, userId: user.id, ip: ctx.ip });
      }
      await audit.record({ action: 'auth.login', resourceType: 'user', resourceId: user.id, userId: user.id, ip: ctx.ip });
      return { validated: 1 };
    },

    /** POST /auth/validate: el frontend consulta hasta que la sesión quede validada. */
    async validate(token: string): Promise<ValidateResult> {
      const session = await findActiveSession(token);
      if (!session) return { validated: 0 };
      const user: User | null = await users.findById(session.userId);
      if (!user) return { validated: 0 };
      return {
        validated: 1,
        userId: user.id,
        email: user.email,
        profileComplete: await memberships.hasActive(user.id),
      };
    },

    /** DELETE /auth/session/:token: cierra la sesión. Es idempotente y no revela si existía. */
    async logout(token: string, ctx: RequestContext): Promise<void> {
      const deleted = await sessions.delete(token);
      if (deleted?.userId) {
        await audit.record({ action: 'auth.logout', resourceType: 'user', resourceId: deleted.userId, userId: deleted.userId, ip: ctx.ip });
      }
    },

    /** Para el middleware: quién es la persona detrás de un token, o null si no hay sesión válida. */
    async resolveSession(token: string): Promise<AuthContext | null> {
      const session = await findActiveSession(token);
      return session ? { userId: session.userId, sessionToken: session.token } : null;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
