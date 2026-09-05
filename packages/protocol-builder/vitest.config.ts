/// <reference types="vitest" />

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
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
 * `.storybook/main.ts`; `__tests__/mapboxIsAlwaysMocked.test.ts` holds both in
 * place.
 */
const MAPBOX_ALIAS = {
  find: /^mapbox-gl(\/esm)?$/,
  replacement: join(here, 'src/fields/geospatial/__tests__/mapboxMock.ts'),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias: [MAPBOX_ALIAS] },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [disableModernAnimationsSetup, './src/__tests__/setup.ts'],
    testTimeout: 20_000,
  },
});
