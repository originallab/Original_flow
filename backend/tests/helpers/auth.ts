import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import type { AppConfig } from '../../src/config/index.js';

export const emailUnico = () => `persona-${randomUUID().slice(0, 8)}@correo.com`;

/** Cuerpo que enviaría Original Auth al callback, con los secretos correctos. */
export function cuerpoCallback(config: AppConfig, session: string, extra: Record<string, unknown> = {}) {
  return {
    token_app: config.originalAuth.tokenApp,
    secret_key: config.originalAuth.secretKey,
    session,
    email: emailUnico(),
    name: 'Persona de Prueba',
    ...extra,
  };
}

export async function crearSesion(app: Express): Promise<string> {
  const res = await request(app).get('/api/v1/auth/session');
  return res.body.session as string;
}

/** Hace el login completo (sesión + callback) y devuelve el token ya validado. */
export async function iniciarSesion(app: Express, config: AppConfig, extra: Record<string, unknown> = {}): Promise<{ token: string; email: string }> {
  const token = await crearSesion(app);
  const body = cuerpoCallback(config, token, extra);
  await request(app).post('/api/v1/auth/callback').send(body);
  return { token, email: body.email as string };
}
