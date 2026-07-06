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
        // Workspace libraries are consumed as built `dist` and kept fresh by
        // their `dev` watchers (run via `with-turbo --watch-deps`). Exclude
        // them from Vite's dependency pre-bundling so Storybook resolves the
        // current `dist` instead of a stale pre-bundle cached under
        // `.cache/storybook/**/sb-vite/deps`.
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
