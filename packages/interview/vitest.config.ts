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
  plugins: [react()],
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
            // These stories mount full interview shells (Redux store + search
            // web workers); running files in parallel iframes starves the
            // worker round-trips past any timeout (Navigation / roster filter
            // stories fail on every loaded run) and is slower overall than
            // sequential execution. Keep files sequential.
            fileParallelism: false,
          },
          exclude: ['**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
