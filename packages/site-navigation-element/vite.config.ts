import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  define:
    command === 'build'
      ? { 'process.env.NODE_ENV': JSON.stringify('production') }
      : undefined,
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/element.tsx'),
      formats: ['es'],
      fileName: () => 'element.js',
    },
    minify: true,
    sourcemap: true,
    emptyOutDir: true,
  },
}));
