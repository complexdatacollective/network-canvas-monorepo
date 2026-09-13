import { defineConfig } from 'vitest/config';

// Deliberately separate from the fast server suite. This gate uses built
// images and owns fresh Compose projects, databases and volumes.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['qualification/**/*.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 180_000,
    maxWorkers: 1,
    fileParallelism: false,
  },
});
