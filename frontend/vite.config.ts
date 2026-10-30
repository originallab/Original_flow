import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    // Para probar con una dirección pública temporal (el panel «Ports» de VS Code, un túnel): Vite rechaza los nombres
    // de dominio que no conoce. Solo aplica al servidor de desarrollo; la compilación de producción no lo usa.
    allowedHosts: ['.devtunnels.ms'],
    // En desarrollo el navegador habla solo con este servidor y él reenvía /api al backend:
    // así no hace falta configurar CORS para trabajar en local.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // Las pruebas de pantalla escriben mucho texto y corren en paralelo: con 5 s a veces se pasaban por lentitud, no por un error.
    testTimeout: 20_000,
  },
});
