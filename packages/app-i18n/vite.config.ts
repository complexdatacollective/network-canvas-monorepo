import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

import { appI18n } from './src/vite.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        'messages': resolve(currentDir, 'src/messages.ts'),
        'react': resolve(currentDir, 'src/react.tsx'),
        'negotiate': resolve(currentDir, 'src/negotiate.ts'),
        'locales': resolve(currentDir, 'src/locales.ts'),
        'common': resolve(currentDir, 'src/common.ts'),
        'vite': resolve(currentDir, 'src/vite.ts'),
        'catalog-guards': resolve(currentDir, 'src/catalog-guards.ts'),
      },
      formats: ['es'],
    },
    rolldownOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        'react-intl',
        '@formatjs/cli-lib',
        '@formatjs/icu-messageformat-parser',
        '@formatjs/intl-localematcher',
        '@formatjs/unplugin/vite',
        'vite',
        /^node:/,
      ],
    },
  },
  plugins: [
    // This package ships `common.*` descriptors and their catalogs, so it
    // compiles its own messages on the way out for the same reason its hosts
    // do. `build: 'library'` is what keeps the ICU parser resolvable here:
    // aliasing it away belongs to the application bundle, not to a package
    // that has no idea what its consumers do.
    ...appI18n({ build: 'library' }),
    // No `bundleTypes`: that route runs declarations through API Extractor,
    // which ships its own TypeScript and cannot resolve globals against the
    // workspace's TS 7 lib. Per-module `.d.ts` needs no second type system
    // and matches every other package here.
    dts({
      include: ['src'],
    }),
  ],
});
