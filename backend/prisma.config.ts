import { defineConfig } from 'prisma/config';

// Configuración de Prisma 7 (herramienta de línea de comandos: generate, migrate, studio).
// Es la única excepción a "las variables de entorno solo se leen en src/config":
// aquí corre fuera de la aplicación. Carga backend/.env si existe.
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env se usan las variables que ya estén definidas en el entorno.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // `generate` no necesita la URL; `migrate` sí y falla con un error claro si está vacía.
    url: process.env.DATABASE_URL ?? '',
  },
});
