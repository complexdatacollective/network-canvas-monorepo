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
  viteFinal: (config) =>
    mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: {
        // Resolve the app's `~/*` path alias (tsconfig.app.json) so stories can
        // import from `~/lib/...` exactly like the renderer does.
        tsconfigPaths: true,
      },
      optimizeDeps: {
        // Workspace packages resolve to raw TypeScript source (symlinked
        // outside node_modules' real path), so Vite never prebundles them
        // anyway; excluded here so Storybook transforms them through its own
        // pipeline rather than attempting to pre-bundle.
        exclude: [
          '@codaco/art',
          '@codaco/fresco-ui',
          '@codaco/interview',
          '@codaco/network-exporters',
          '@codaco/protocol-utilities',
          '@codaco/protocol-validation',
          '@codaco/shared-consts',
        ],
      },
    }),
});
