import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Las pruebas con base de datos real comparten una misma base: los archivos
    // corren en serie para que no se pisen (playbook 04, punto 4).
    fileParallelism: false,
    // Las pruebas con base de datos real arman varias cosas por prueba (negocio, funnel, publicar...).
    testTimeout: 20_000,
  },
});
