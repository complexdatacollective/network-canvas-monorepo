import { defineMain } from '@storybook/react-vite/node';
import tailwindcss from '@tailwindcss/vite';
import { mergeConfig } from 'vite';

export default defineMain({
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    check: false,
  },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  viteFinal: (config) =>
    mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: {
        // Match Architect's `~/*` source alias.
        tsconfigPaths: true,
      },
      optimizeDeps: {
        // Workspace packages expose raw TypeScript source. Storybook should
        // transform that source itself instead of trying to pre-bundle it.
        exclude: [
          '@codaco/art',
          '@codaco/fresco-ui',
          '@codaco/interface-images',
          '@codaco/interview',
          '@codaco/network-query',
          '@codaco/protocol-utilities',
          '@codaco/protocol-validation',
          '@codaco/protocols',
          '@codaco/shared-consts',
        ],
      },
    }),
});
