/// <reference types="vitest" />

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

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
          setupFiles: [disableModernAnimationsSetup, './src/test-setup.ts'],
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
        // Vite's dependency scanner cannot see these: every one of them is
        // reached only at runtime, behind the virtual project-annotations
        // module that Storybook's setup file imports. Anything left out is
        // discovered while the suite is already running, and the re-optimise
        // that follows changes the `browserv` hash and reloads the page,
        // killing in-flight module fetches — the whole suite then fails with
        // "Failed to fetch dynamically imported module" on a cold cache
        // while passing on a warm one.
        //
        // The list has to stay complete. To rebuild it, delete
        // `node_modules/.cache/storybook/*/*/sb-vitest`, run
        // `pnpm test:storybook`, and add every specifier the
        // "dependencies optimized:" / "dependency optimized:" lines report.
        // Deps owned by a workspace package are not resolvable from this
        // root, so they need Vite's `<owner> > <dep>` form.
        optimizeDeps: {
          include: [
            // Reached as this app → fresco-ui → app-i18n. Vite's
            // `<owner> > <dep>` form has to name the owner the whole way
            // down: a shorter specifier does not resolve from this root,
            // and an entry Vite cannot resolve is ignored in silence.
            '@codaco/fresco-ui > @codaco/app-i18n > @formatjs/icu-messageformat-parser',
            '@codaco/fresco-ui > @codaco/app-i18n > react-intl',
            '@base-ui/react',
            '@base-ui/react/checkbox',
            '@base-ui/react/collapsible',
            '@base-ui/react/dialog',
            '@base-ui/react/popover',
            '@base-ui/react/switch',
            '@base-ui/react/tooltip',
            '@codaco/fresco-ui > @radix-ui/react-slot',
            '@codaco/fresco-ui > comlink',
            '@codaco/fresco-ui > fuse.js',
            '@codaco/fresco-ui > immer',
            '@codaco/fresco-ui > nanoid',
            '@codaco/fresco-ui > react-best-merge-refs',
            '@codaco/fresco-ui > react-markdown',
            '@codaco/fresco-ui > rehype-raw',
            '@codaco/fresco-ui > rehype-sanitize',
            '@codaco/fresco-ui > remark-gemoji',
            '@codaco/fresco-ui > remark-gfm',
            '@codaco/fresco-ui > usehooks-ts',
            '@codaco/fresco-ui > zustand',
            '@codaco/fresco-ui > zustand/middleware',
            '@codaco/fresco-ui > zustand/middleware/immer',
            '@codaco/fresco-ui > zustand/react/shallow',
            '@codaco/fresco-ui > zustand/shallow',
            '@codaco/fresco-ui > zustand/vanilla',
            '@codaco/interview > ohash',
            '@reduxjs/toolkit > immer',
            'jszip',
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
