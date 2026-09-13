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
    // Those launches are what the old cap of two was protecting: a `spawnSync`
    // of a cold entrypoint blocks its worker and has 10s to finish. Three
    // workers can have three of them in flight, so that headroom was measured
    // rather than assumed, using the two `it.each` cases in
    // src/observability/__tests__/startup.test.ts whose whole body is one
    // spawn and no database work. Worst case per run, against the 10s cap:
    // 2305ms at two workers, then 1768 / 2072 / 3086 / 3145ms at three. The
    // distributions overlap — two of the four are faster than the two-worker
    // run — so the third worker does not systematically starve a spawn, and
    // the tightest margin seen is still 3.2x. If that ever narrows, this is
    // the measurement to repeat before blaming the test.
    //
    // Three, not two, because the suite is bound by how long its work takes
    // to drain rather than by CPU. Measured on the dedicated runner, the two
    // phases vitest reports sum to about 970s of work (import 139s, tests
    // 833s), and at two workers that drained in 493s — the halving the model
    // predicts, which is what says the workers are the constraint.
    //
    // Three, and not more, because a single file is the floor, and the third
    // worker is already spending against it. The migration security
    // invariants are one file, and 91% of that file is the real
    // `migrateDatabase` those tests exist to exercise, so it cannot be
    // shortened without deleting coverage and it cannot be split across
    // workers. It runs ~310s with two workers and 412-466s with three,
    // because the extra worker contends for the same Postgres — and at three
    // the suite lands on top of that file every time: 417/468/439/430s of
    // suite against 415/466/431/412s of file. The suite is that file now.
    //
    // So a fourth worker buys nothing: the remaining work already drains
    // before the floor does, and more concurrent migrations would only raise
    // the floor further. Going below it means splitting that file, not
    // adding workers. What the third worker does buy is real but smaller
    // than the arithmetic suggests — 493s to 417-468s — because part of the
    // gain is given straight back as contention.
    //
    // One ceiling moved with it: a scratch schema holds three pools of `max`
    // 20, so the theoretical peak goes from 120 connections to 180 against
    // the service container's default `max_connections` of 100. It was
    // already nominally over at two workers and has never bitten, because pg
    // pools open connections on demand rather than reserving `max` — but if
    // `too many clients already` ever appears, this is the arithmetic behind
    // it, and the fix is the pool sizes rather than the worker count.
    maxWorkers: 3,
    // The protocol suites validate whole fixture protocols and build a
    // fourteen-table schema per file.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
