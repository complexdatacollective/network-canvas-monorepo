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
    // Several integration files launch fresh Node processes that import the
    // source graph. Two workers leave enough CPU for those cold imports on
    // the four-vCPU CI runner while retaining bounded file parallelism.
    maxWorkers: 2,
    // The protocol suites validate whole fixture protocols and build a
    // fourteen-table schema per file.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
