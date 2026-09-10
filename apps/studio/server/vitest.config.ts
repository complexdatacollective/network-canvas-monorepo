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
    // source graph, so this stays well under the four vCPUs of the CI runner
    // the suite has to itself.
    //
    // Three, not two, because the suite is bound by how long its work takes
    // to drain rather than by CPU. Measured on the dedicated runner, the two
    // phases vitest reports sum to about 970s of work (import 139s, tests
    // 833s), and at two workers that drained in 493s — the halving the model
    // predicts, which is what says the workers are the constraint.
    //
    // Three, and not more, because a single file is the floor. The migration
    // security invariants take ~330s in one file, and 91% of that is the real
    // `migrateDatabase` those tests exist to exercise, so it cannot be
    // shortened without deleting coverage and it cannot be split across
    // workers. Three workers drain the remaining work in about the time that
    // file takes; a fourth would finish its share earlier and then wait on
    // the same file, buying no wall time while adding contention to the
    // budgets below.
    maxWorkers: 3,
    // The protocol suites validate whole fixture protocols and build a
    // fourteen-table schema per file.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
