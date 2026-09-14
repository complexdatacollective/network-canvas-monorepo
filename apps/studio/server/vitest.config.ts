import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Tests run against the committed development defaults — the same values
// `pnpm dev` gets. Vitest loads no env files of its own, and src/env/variables.ts
// deliberately declares no defaults, so without this the suite would see an
// entirely unconfigured server and every integration probe would skip.
process.loadEnvFile(
  fileURLToPath(new URL('.env.development', import.meta.url)),
);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // The protocol suites validate whole fixture protocols and build a
    // fourteen-table schema per file.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
