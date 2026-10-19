import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/** Todo el texto de los archivos de una carpeta (recursivo). */
function readAll(dir: string): string {
  return readdirSync(dir)
    .map((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? readAll(path) : /\.(js|css|html)$/.test(name) ? readFileSync(path, 'utf-8') : '';
    })
    .join('\n');
}

const outDir = mkdtempSync(join(tmpdir(), 'of-prod-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('compilación de producción', () => {
  it('no incluye el modo demostración ni el acceso simulado a Original Auth, ni sus valores', () => {
    // El peor caso: se compila con TODAS las variables de desarrollo encendidas y con valores reconocibles.
    execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        VITE_DEMO_MODE: 'true',
        VITE_AUTH_MODE: 'mock_callback',
        VITE_MOCK_TOKEN_APP: 'SENTINELA-TOKEN-APP',
        VITE_MOCK_SECRET_KEY: 'SENTINELA-SECRETO',
      },
    });
    const bundle = readAll(outDir);
    expect(bundle.length).toBeGreaterThan(10_000); // se compiló de verdad

    for (const rastro of ['SENTINELA-TOKEN-APP', 'SENTINELA-SECRETO', 'of-demo-db', 'Modo demostración', 'Modo de desarrollo', 'mock_callback']) {
      expect(bundle, `la compilación de producción contiene «${rastro}»`).not.toContain(rastro);
    }
  }, 120_000);
});
