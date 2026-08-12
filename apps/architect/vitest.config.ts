/// <reference types="vitest" />

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    // Register the virtual service-worker module for unit tests that import
    // AppUpdateProvider. The service worker is not built under Vitest.
    VitePWA({ registerType: 'prompt', injectRegister: false }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    globals: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/storybook-static/**',
      'e2e/**',
    ],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          // Parallelised with the rest of the workspace's tests in the CI
          // quality job; give jsdom tests headroom under peak runner load.
          testTimeout: 20_000,
          setupFiles: [
            '../../packages/fresco-ui/vitest.setup.disable-animations.ts',
            './src/test-setup.ts',
          ],
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/*.stories.{ts,tsx}',
          ],
          // Prevent PostHog from initialising against the production host.
          env: {
            VITE_DISABLE_ANALYTICS: 'true',
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'scripts',
          environment: 'node',
          include: ['scripts/**/*.{test,spec}.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/dist/**'],
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: resolve(here, '.storybook'),
            storybookScript: 'storybook dev -p 6006 --no-open',
          }),
        ],
        // These dependencies are first reached through Storybook's virtual
        // project-annotations module. Pre-bundle them before Chromium starts
        // so Vite does not reload the page and invalidate the test setup.
        optimizeDeps: {
          include: [
            '@base-ui/react',
            '@base-ui/react/dialog',
            '@base-ui/react/popover',
            '@base-ui/react/tooltip',
            '@codaco/fresco-ui > @radix-ui/react-slot',
            '@codaco/fresco-ui > immer',
            '@codaco/fresco-ui > nanoid',
            '@codaco/fresco-ui > react-best-merge-refs',
            '@codaco/fresco-ui > zustand',
            '@codaco/fresco-ui > zustand/middleware/immer',
            '@codaco/fresco-ui > zustand/vanilla',
            '@reduxjs/toolkit > immer',
            'zod',
            'zod/mini',
          ],
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
