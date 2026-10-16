import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import type { AppConfig } from '../../src/config/index.js';
import type { MembershipRole } from '../../src/generated/prisma/client.js';
import type { PrismaClient } from '../../src/models/prisma.js';
import { iniciarSesion } from './auth.js';

export const encabezados = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Una persona que inicia sesión y crea su negocio: queda como administradora de su cliente. */
export async function crearNegocio(app: Express, config: AppConfig) {
  const sesion = await iniciarSesion(app, config);
  const res = await request(app)
    .post('/api/v1/workspaces')
    .set(encabezados(sesion.token))
    .send({ name: `Marca ${randomUUID().slice(0, 6)}` });
  return { ...sesion, workspace: res.body as { id: string; clientId: string; name: string } };
}

/** Una persona con sesión y una membresía de workspace puesta directamente en la base. */
export async function agregarMiembro(app: Express, prisma: PrismaClient, config: AppConfig, workspaceId: string, role: MembershipRole) {
  const sesion = await iniciarSesion(app, config);
  const usuario = await prisma.user.findUniqueOrThrow({ where: { email: sesion.email } });
  const membership = await prisma.membership.create({ data: { userId: usuario.id, role, status: 'active', workspaceId } });
  return { ...sesion, userId: usuario.id, membershipId: membership.id };
}
