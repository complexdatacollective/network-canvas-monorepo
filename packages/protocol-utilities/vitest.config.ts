import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'node',
    // Set for the package because a per-test wall clock cannot be read here.
    // The seeded sweeps run a full network generation per seed, and the heaviest
    // file takes minutes in aggregate; the rest of the package's files share the
    // runner with it. Tests measured at 0.3-0.6s alone have been observed at
    // 6-11s under that contention — a spread wide enough that vitest's 5s
    // default fails on runner load rather than on anything the code did. A real
    // slowdown shows up in the file totals, which are reported either way.
    testTimeout: 60_000,
  },
});
