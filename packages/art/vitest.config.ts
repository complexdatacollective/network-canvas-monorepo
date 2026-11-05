/// <reference types="vitest" />

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import { BROWSER_VIEWPORT } from '@codaco/vitest-config/modern/browser-viewport';
import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Two runners, because this package is checked two ways.
 *
 * `unit` is the jsdom suite. `storybook` renders every story in a real browser,
 * which is the only place the a11y addon's `test: 'error'` setting means
 * anything: outside it the addon reports into a panel nobody reads in CI.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          // Parallelised with the rest of the workspace's tests in the CI
          // quality job; give jsdom tests headroom under peak runner load, and
          // room for the shared setup's 5s Testing Library wait budget to
          // report first.
          testTimeout: 20_000,
          setupFiles: [
            disableModernAnimationsSetup,
            resolve(here, 'src/__tests__/setup.ts'),
          ],
          include: [
            'src/**/*.{test,spec}.{ts,tsx}',
            'src/**/__tests__/**/*.{test,spec}.{ts,tsx}',
          ],
          exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/*.stories.{ts,tsx}',
          ],
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: resolve(here, '.storybook'),
            storybookScript: 'storybook dev -p 6007 --no-open',
          }),
        ],
        test: {
          name: 'storybook',
          testTimeout: 60_000,
          browser: {
            provider: playwright(),
            enabled: true,
            instances: [{ browser: 'chromium' }],
            headless: true,
            viewport: BROWSER_VIEWPORT,
          },
          exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/*.{test,spec}.{ts,tsx}',
          ],
        },
      },
    ],
  },
});
