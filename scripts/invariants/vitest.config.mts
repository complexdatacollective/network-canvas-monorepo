/// <reference types="vitest" />

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Repository-wide source invariants: rules of the form "this string appears
// nowhere under packages/ or apps/". They are not a workspace package's tests
// because the tree they describe is the whole repository, and a package's
// `test` task only re-runs when that package (or one it depends on) changes —
// an invariant has to re-run when ANY source file changes. They therefore run
// through the root `//#test:invariants` turbo task, whose inputs cover every
// tree the scans read, in the quality-support CI job on every pull request.
export default defineConfig({
  // The repository root, so a suite resolves `packages` and `apps` the same
  // way wherever vitest was started from.
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['scripts/invariants/*.test.mjs'],
    // Each suite reads thousands of files synchronously; give it a process of
    // its own rather than a worker thread shared with another scan.
    pool: 'forks',
  },
});
