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
      resolve: {
        tsconfigPaths: true,
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
