import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config/index.js';
import { createLogger } from './lib/logger.js';
import { createPrismaClient } from './models/prisma.js';

function main(): void {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger(config.logLevel);
  const prisma = createPrismaClient(config.databaseUrl);
  const app = createApp(config, logger, prisma);
  const server = app.listen(config.port, () => {
    logger.info('servidor iniciado', { port: config.port, env: config.env });
  });

  const shutdown = (signal: string) => {
    logger.info('cerrando servidor', { signal });
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
