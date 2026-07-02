import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineMain } from '@storybook/react-vite/node';
import tailwindcss from '@tailwindcss/vite';
import { mergeConfig } from 'vite';

// This file lives in packages/interview/.storybook, so its directory is the
// storybook root and its parent is the package root.
const storybookDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(storybookDir, '..', 'src');

export default defineMain({
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
    '@chromatic-com/storybook',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    check: false,
  },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  // Static fixtures used by stories — roster JSON for NameGeneratorRoster
  // and geojson layers for Geospatial. Served at `/storybook/<file>`.
  staticDirs: ['./static'],
  viteFinal: (config) =>
    mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: {
        // tsconfig.json excludes story files, so Vite's native
        // resolve.tsconfigPaths won't map `~/` for them (see vitest.config.ts).
        // Alias explicitly. `.storybook` is first because `~/.storybook/…` also
        // matches the bare `~/` pattern and Vite uses the first match.
        alias: [
          { find: /^~\/\.storybook\//, replacement: `${storybookDir}/` },
          { find: /^~\//, replacement: `${srcDir}/` },
        ],
      },
      // mapbox-gl's worker bundle contains import.meta; the default classic
      // (iife) worker emission loads it as a non-module script and the worker
      // dies with "Cannot use 'import.meta' outside a module", leaving the
      // Geospatial map without tiles. ES format workers are loaded with
      // { type: 'module' } and run it fine.
      worker: {
        format: 'es',
      },
      optimizeDeps: {
        include: ['d3-force'],
        // Workspace libraries are consumed as built `dist` and kept fresh by
        // their `dev` watchers (run via `with-turbo --watch-deps`). Exclude them
        // from Vite's dependency pre-bundling so Storybook resolves the current
        // `dist` instead of a stale pre-bundle cached under
        // `.cache/storybook/**/sb-vite/deps`.
        exclude: [
          '@codaco/fresco-ui',
          '@codaco/shared-consts',
          '@codaco/protocol-validation',
          '@codaco/protocol-utilities',
          '@codaco/network-query',
          '@codaco/network-exporters',
        ],
      },
    }),
});
