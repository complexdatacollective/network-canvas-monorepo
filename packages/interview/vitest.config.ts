import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import { disableModernAnimationsSetup } from '@codaco/vitest-config/modern/setup-path';

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
          setupFiles: [
            disableModernAnimationsSetup,
            path.join(dirname, 'vitest.setup.ts'),
          ],
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
        // root, so they need Vite's `<owner> > <dep>` form — and the owner
        // has to be named the whole way down. `react-intl` arrives here as
        // interview → fresco-ui → app-i18n, so neither `react-intl` nor
        // `@codaco/app-i18n > react-intl` resolves: this package depends on
        // neither, and an entry Vite cannot resolve is ignored in silence.
        optimizeDeps: {
          include: [
            '@base-ui/react/accordion',
            '@base-ui/react/checkbox',
            '@base-ui/react/dialog',
            '@base-ui/react/menu',
            '@base-ui/react/popover',
            '@base-ui/react/progress',
            '@base-ui/react/radio',
            '@base-ui/react/slider',
            '@base-ui/react/switch',
            '@base-ui/react/toolbar',
            '@codaco/fresco-ui > @codaco/app-i18n > @formatjs/icu-messageformat-parser',
            '@codaco/fresco-ui > @codaco/app-i18n > react-intl',
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
            'd3-force',
            'zod',
            'zustand/shallow',
            'zustand/vanilla',
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
            // These stories mount full interview shells (Redux store + search
            // web workers); running files in parallel iframes starves the
            // worker round-trips past any timeout (Navigation / roster filter
            // stories fail on every loaded run) and is slower overall than
            // sequential execution. Keep files sequential.
            fileParallelism: false,
            // Reuse one iframe for every file instead of building a fresh one
            // per file. These 60 files each mount a full interview shell —
            // WebGL canvases, mapbox maps, search workers — and the detached
            // iframes hold their native resources long enough that the
            // renderer dies partway through the run, taking the whole suite
            // with it ("Browser connection was closed while running tests",
            // on a different file each time). Reusing the iframe recycles
            // those resources instead of accumulating 60 sets of them.
            isolate: false,
          },
          exclude: ['**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
