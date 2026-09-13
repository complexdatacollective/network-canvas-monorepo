/// <reference types="vitest" />

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// The repository's guard scripts. These are not a workspace package: they have
// no source of their own to build and they deliberately share the root's
// devDependencies (yaml, jsdom, playwright) rather than declaring a second
// copy, so they run through the root `//#test:scripts` turbo task instead of
// the per-package `test` task.
export default defineConfig({
  // The repository root, not this directory. These suites shell out to git,
  // spawn the scripts they cover and read workflow files by relative path, all
  // of which resolved against the repository root under `node --test`. Rooting
  // vitest here keeps that true; rooting it at the config would silently move
  // every one of those lookups into scripts/.
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    disableConsoleIntercept: true,
    // Tests live beside the script they guard, inside its area folder. The
    // skill script is here because it had no runner at all before: nothing
    // executed it, which only became visible once knip could see it.
    include: [
      'scripts/*/**/*.test.mjs',
      '.agents/skills/**/scripts/*.test.mjs',
    ],
    // These suites spawn processes, servers and browsers rather than
    // exercising functions in-process: the dead-link checker drives a real
    // Chrome, the release guards shell out to git. Vitest's 5s default is for
    // unit tests and would fail every one of them.
    hookTimeout: 120_000,
    testTimeout: 240_000,
    // Each file spawns child processes and binds sockets, so give every file
    // its own process rather than sharing a worker thread.
    pool: 'forks',
  },
});
