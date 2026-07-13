import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // `~/*` and `~/.storybook/*` mirror this package's tsconfig `paths`. Vite's
    // native resolve.tsconfigPaths honours tsconfig `exclude`, and tsconfig.json
    // excludes the test/story files — so `~/` imports (and `vi.mock('~/…')`)
    // resolve for source files but not for those. Alias them explicitly so `~/`
    // resolves for every file. `.storybook` is listed first because
    // `~/.storybook/…` also matches the bare `~/` pattern and Vite uses the
    // first matching alias.
    alias: [
      {
        find: /^~\/\.storybook\//,
        replacement: `${path.join(dirname, '.storybook')}/`,
      },
      { find: /^~\//, replacement: `${path.join(dirname, 'src')}/` },
    ],
  },
  plugins: [react()],
  define: {
    // Pin to a constant so test behaviour never depends on the real release
    // version (kept deterministic across `changeset version` bumps).
    __PACKAGE_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    globals: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/specs/**',
      '**/storybook-static/**',
    ],
    projects: [
      {
        extends: true,
        test: {
          name: 'units',
          environment: 'jsdom',
          // This heavy jsdom suite is parallelised alongside the rest of the
          // workspace's tests in the CI quality job; under peak runner load a
          // borderline test (e.g. a WebGL-backed interface interaction) can be
          // starved past the 5s default, so give generous headroom.
          testTimeout: 20_000,
          setupFiles: [path.join(dirname, 'vitest.setup.ts')],
          include: [
            'src/**/*.{test,spec}.{ts,tsx}',
            'src/**/__tests__/**/*.{test,spec}.{ts,tsx}',
            'e2e/host/src/**/*.{test,spec}.{ts,tsx}',
            'e2e/helpers/**/*.{test,spec}.{ts,tsx}',
            'e2e/matrix/**/*.{test,spec}.{ts,tsx}',
          ],
          exclude: ['**/*.stories.{ts,tsx}'],
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
            storybookScript: 'storybook dev -p 6006 --no-open',
          }),
        ],
        // d3-force is not reachable by Vite's static import scanner (it is
        // only pulled in at runtime via the virtual project-annotations
        // module). Without this, Vite discovers it as a new dependency
        // mid-run, re-optimises the bundle, changes the `browserv` hash and
        // invalidates in-flight fetches of setup-file-with-project-
        // annotations.js — producing "Failed to fetch dynamically imported
        // module" errors on every cold-cache run.
        optimizeDeps: {
          include: ['d3-force'],
        },
        test: {
          name: 'storybook',
          testTimeout: 60_000,
          browser: {
            provider: playwright(),
            enabled: true,
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
          exclude: ['**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
