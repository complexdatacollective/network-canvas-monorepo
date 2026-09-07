import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineMain } from '@storybook/react-vite/node';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * No story may reach the real Mapbox SDK.
 *
 * A real `mapbox-gl` map fetches a style, tiles, sprites and fonts from
 * Mapbox's servers, and those are billed requests against the project's own
 * account — from a Storybook that is built on every push and replayed by every
 * visual comparison. Replaced here rather than per story so that a story
 * mounting a section that mounts a field that draws a map is covered without
 * naming the SDK, which is the same reasoning behind the alias in
 * `vitest.config.ts`.
 */
const MAPBOX_ALIAS = {
  find: /^mapbox-gl(\/esm)?$/,
  replacement: join(here, 'mapboxMock.ts'),
};

export default defineMain({
  addons: [
    getAbsolutePath('@storybook/addon-docs'),
    getAbsolutePath('@storybook/addon-a11y'),
    getAbsolutePath('@storybook/addon-mcp'),
  ],
  framework: {
    name: getAbsolutePath('@storybook/react-vite'),
    options: {},
  },
  stories: ['../src/**/*.stories.tsx'],
  typescript: { check: false },
  viteFinal: async (config) => {
    config.plugins = [...(config.plugins ?? []), react(), tailwindcss()];
    const alias = config.resolve?.alias;
    config.resolve = {
      ...config.resolve,
      alias: Array.isArray(alias)
        ? [...alias, MAPBOX_ALIAS]
        : [
            ...Object.entries(alias ?? {}).map(([find, replacement]) => ({
              find,
              replacement: String(replacement),
            })),
            MAPBOX_ALIAS,
          ],
    };
    return config;
  },
});

function getAbsolutePath(value: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
