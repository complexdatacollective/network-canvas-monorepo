/// <reference types="vitest" />

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

import { arrayBufferAssetPlugin } from './vite.renderer.config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    arrayBufferAssetPlugin(),
    // Registers the `virtual:pwa-register/react` module id so components
    // importing `useRegisterSW` can be loaded under test — vitest.config.ts
    // doesn't otherwise share vite.config.ts's VitePWA plugin instance, and
    // vite's import-analysis needs the id to resolve before a `vi.mock` of it
    // can take effect. No SW is actually built under vitest.
    VitePWA({ registerType: 'prompt', injectRegister: false }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  // `__APP_VERSION__` is injected by vite.renderer.config.ts for real builds;
  // stub it here so modules reading APP_VERSION can be imported under test.
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/storybook-static/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          // This jsdom suite is parallelised alongside the rest of the
          // workspace's tests in the CI quality job; under peak runner load a
          // borderline test can be starved past the 5s default, so give
          // generous headroom.
          testTimeout: 20_000,
          setupFiles: [disableModernAnimationsSetup, './src/test-setup.ts'],
          include: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
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
            '@codaco/fresco-ui > @codaco/app-i18n > react-intl/server',
            '@base-ui/react',
            '@base-ui/react/accordion',
            '@base-ui/react/checkbox',
            '@base-ui/react/combobox',
            '@base-ui/react/drawer',
            '@base-ui/react/menu',
            '@base-ui/react/popover',
            '@base-ui/react/progress',
            '@base-ui/react/radio',
            '@base-ui/react/radio-group',
            '@base-ui/react/slider',
            '@base-ui/react/switch',
            '@base-ui/react/toggle',
            '@base-ui/react/toggle-group',
            '@base-ui/react/toolbar',
            '@base-ui/react/tooltip',
            '@codaco/art > blobs/v2/animate',
            '@codaco/fresco-ui > @faker-js/faker',
            '@codaco/fresco-ui > @radix-ui/react-slot',
            '@codaco/fresco-ui > comlink',
            '@codaco/fresco-ui > cva',
            '@codaco/fresco-ui > es-toolkit',
            '@codaco/fresco-ui > es-toolkit/compat',
            '@codaco/fresco-ui > immer',
            '@codaco/fresco-ui > nanoid',
            '@codaco/fresco-ui > react-best-merge-refs',
            '@codaco/fresco-ui > react-markdown',
            '@codaco/fresco-ui > rehype-raw',
            '@codaco/fresco-ui > rehype-sanitize',
            '@codaco/fresco-ui > remark-gemoji',
            '@codaco/fresco-ui > remark-gfm',
            '@codaco/fresco-ui > tailwind-merge',
            '@codaco/fresco-ui > usehooks-ts',
            '@codaco/fresco-ui > zustand',
            '@codaco/fresco-ui > zustand/middleware',
            '@codaco/fresco-ui > zustand/middleware/immer',
            '@codaco/fresco-ui > zustand/react/shallow',
            '@codaco/fresco-ui > zustand/shallow',
            '@codaco/fresco-ui > zustand/vanilla',
            '@codaco/interview > @reduxjs/toolkit',
            '@codaco/interview > concaveman',
            '@codaco/interview > csvtojson',
            '@codaco/interview > html-to-image',
            '@codaco/interview > mapbox-gl/esm',
            '@codaco/interview > ohash',
            '@codaco/interview > react-redux',
            '@codaco/interview > redux-logger',
            'chromatic/isChromatic',
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
