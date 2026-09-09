/// <reference types="vitest" />

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * No test may reach the real Mapbox SDK.
 *
 * A real `mapbox-gl` map fetches a style, tiles, sprites and fonts from
 * Mapbox's servers. Those are billed requests against a live account, made
 * from a suite that runs on every push — the failure mode is a bill, not a red
 * test — and the map needs a WebGL context jsdom does not have anyway.
 *
 * Replaced here rather than by a `vi.mock` in each file that can reach it,
 * because which files those are is not a property of the map at all: every
 * editor family is imported by `stageEditorRegistry.ts`, so anything mounting
 * the package's dispatcher — which is most of the suite — has the geospatial
 * editor, and therefore the SDK, in its module graph. A rule each of those
 * files has to remember would be forgotten by exactly the file at risk. This
 * is the same mechanism, for the same reason, as the alias in
 * `.storybook/main.ts`; `src/testing/__tests__/mapboxIsAlwaysMocked.test.ts`
 * holds both in place.
 */
const MAPBOX_ALIAS = {
  find: /^mapbox-gl(\/esm)?$/,
  replacement: join(here, 'src/testing/mapboxMock.ts'),
};

/**
 * Two runners, because this package is checked two ways.
 *
 * `unit` is the jsdom suite every module here is written against. `storybook`
 * runs each story's own play function in a real browser — which is the only
 * check that runs them at all, and the only place the a11y addon's
 * `test: 'error'` setting means anything: outside it the addon reports into a
 * panel nobody reads in CI.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [MAPBOX_ALIAS] },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: [
            disableModernAnimationsSetup,
            './src/__tests__/setup.ts',
          ],
          // Parallelised with the rest of the workspace's suites in CI's
          // quality job, where a borderline jsdom test can be starved past the
          // 5s default under peak load.
          testTimeout: 20_000,
          include: [
            'src/**/*.{test,spec}.{ts,tsx}',
            'src/**/__tests__/**/*.{test,spec}.{ts,tsx}',
          ],
          exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/storybook-static/**',
            '**/*.stories.{ts,tsx}',
          ],
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: join(here, '.storybook'),
            storybookScript: 'storybook dev -p 6010 --no-open',
          }),
        ],
        // Vite's dependency scanner cannot see these: each is reached only at
        // runtime, behind the virtual project-annotations module Storybook's
        // setup file imports. Anything left out is discovered while the suite
        // is already running, and the re-optimise that follows changes the
        // `browserv` hash and reloads the page, killing in-flight module
        // fetches — the whole suite then fails with "Failed to fetch
        // dynamically imported module" on a cold cache while passing on a warm
        // one.
        //
        // To rebuild the list, delete
        // `node_modules/.cache/storybook/*/*/sb-vitest`, run
        // `pnpm test:storybook`, and add every specifier the "dependencies
        // optimized:" / "dependency optimized:" lines report. A dep owned by a
        // workspace package is not resolvable from this root, so it needs
        // Vite's `<owner> > <dep>` form, with the owner named the whole way
        // down.
        optimizeDeps: {
          include: [
            '@codaco/app-i18n > @formatjs/icu-messageformat-parser',
            '@codaco/app-i18n > @formatjs/intl-localematcher',
            '@codaco/app-i18n > react-intl',
            '@codaco/app-i18n > react-intl/server',
            '@codaco/fresco-ui > @base-ui/react/accordion',
            '@codaco/fresco-ui > @base-ui/react/checkbox',
            '@codaco/fresco-ui > @base-ui/react/collapsible',
            '@codaco/fresco-ui > @base-ui/react/dialog',
            '@codaco/fresco-ui > @base-ui/react/direction-provider',
            '@codaco/fresco-ui > @base-ui/react/menu',
            '@codaco/fresco-ui > @base-ui/react/popover',
            '@codaco/fresco-ui > @base-ui/react/progress',
            '@codaco/fresco-ui > @base-ui/react/radio',
            '@codaco/fresco-ui > @base-ui/react/slider',
            '@codaco/fresco-ui > @base-ui/react/switch',
            '@codaco/fresco-ui > @base-ui/react/toolbar',
            '@codaco/fresco-ui > @base-ui/react/tooltip',
            '@codaco/fresco-ui > @radix-ui/react-slot',
            '@codaco/fresco-ui > comlink',
            '@codaco/fresco-ui > cva',
            '@codaco/fresco-ui > fuse.js',
            '@codaco/fresco-ui > nanoid',
            '@codaco/fresco-ui > react-best-merge-refs',
            '@codaco/fresco-ui > react-markdown',
            '@codaco/fresco-ui > rehype-raw',
            '@codaco/fresco-ui > rehype-sanitize',
            '@codaco/fresco-ui > remark-gemoji',
            '@codaco/fresco-ui > remark-gfm',
            '@codaco/fresco-ui > tailwind-merge',
            '@codaco/fresco-ui > usehooks-ts',
            '@codaco/protocol-validation > jszip',
            'csvtojson',
            'es-toolkit/compat',
            'lucide-react',
            'motion/react',
            'remark-parse',
            'unified',
            'uuid',
            'zod',
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
            // One iframe for every file rather than a fresh one per file.
            // These stories mount whole stage editors, and detached iframes
            // hold their native resources long enough to take the renderer
            // down partway through a run.
            isolate: false,
          },
          exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/storybook-static/**',
            '**/*.{test,spec}.{ts,tsx}',
          ],
        },
      },
    ],
  },
});
