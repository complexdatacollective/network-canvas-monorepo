import { defineMain } from '@storybook/react-vite/node';
import tailwindcss from '@tailwindcss/vite';
import { mergeConfig } from 'vite';

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
        // These workspace libraries are consumed as raw TypeScript source
        // (their package `exports` point at `src/`), so Vite resolves them
        // through its own module graph. Linked workspace packages are never
        // pre-bundled anyway, so these entries are inert — kept explicit to
        // document that Storybook must see their live source, not a cached
        // pre-bundle under `.cache/storybook/**/sb-vite/deps`.
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
