import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { mockSystemDark } from './helpers';

// Las pantallas esperan a varias cargas seguidas; con todas las pruebas corriendo a la vez, 1 s a veces no alcanza.
configure({ asyncUtilTimeout: 4000 });

// Cada prueba empieza con el sistema en modo claro, sin preferencia guardada y sin tema aplicado.
beforeEach(() => {
  mockSystemDark(false);
  // Las pruebas no dependen del .env de quien las corre: el modo demostración arranca apagado
  // (lo encienden a propósito las pruebas del modo demostración).
  vi.stubEnv('VITE_DEMO_MODE', 'false');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
