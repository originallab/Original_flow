import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/lib/logger.js';
import { createPrismaClient, type PrismaClient } from '../../src/models/prisma.js';
import { testDatabaseUrl } from './db.js';

/** Variables mínimas válidas para las pruebas. Cada prueba puede sobrescribir las que necesite. */
export const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://usuario:clave@localhost:5432/prueba',
  CORS_ORIGINS: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
  ORIGINALAUTH_TOKEN_APP: 'app-de-prueba',
  ORIGINALAUTH_SECRET_KEY: 'secreto-de-prueba',
  // Alto a propósito: las pruebas comparten IP y no deben chocar con el límite (salvo la que lo prueba).
  RATE_LIMIT_AUTH_SESSION_PER_MINUTE: '10000',
  RATE_LIMIT_PUBLIC_PER_MINUTE: '10000',
  RATE_LIMIT_LEADS_PER_MINUTE: '10000',
};

export function testConfig(overrides: NodeJS.ProcessEnv = {}): AppConfig {
  return loadConfig({ ...baseEnv, ...overrides });
}

/**
 * Crea la app con su cliente de base de datos. Si hay TEST_DATABASE_URL se conecta a esa
 * base real; si no, el cliente no llega a conectarse (solo lo usan las pruebas de base de datos).
 */
export function buildTestApp(overrides: NodeJS.ProcessEnv = {}, deps: { fetchFn?: typeof fetch } = {}): { app: Express; prisma: PrismaClient; config: AppConfig } {
  const config = testConfig({ ...(testDatabaseUrl ? { DATABASE_URL: testDatabaseUrl } : {}), ...overrides });
  const prisma = createPrismaClient(config.databaseUrl);
  return { app: createApp(config, createLogger(config.logLevel), prisma, deps), prisma, config };
}

export function testApp(overrides: NodeJS.ProcessEnv = {}): Express {
  return buildTestApp(overrides).app;
}
