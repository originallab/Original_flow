import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { mockSystemDark } from './helpers';

// Cada prueba empieza con el sistema en modo claro, sin preferencia guardada y sin tema aplicado.
beforeEach(() => {
  mockSystemDark(false);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
