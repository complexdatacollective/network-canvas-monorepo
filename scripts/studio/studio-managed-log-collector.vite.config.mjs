import { resolve } from 'node:path';

import { defineConfig } from 'vite';

const root = import.meta.dirname;

export default defineConfig({
  build: {
    ssr: resolve(root, 'studio-managed-log-collector.mjs'),
    outDir: resolve(root, '../../dist/studio-managed-log-collector'),
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    rolldownOptions: {
      output: {
        entryFileNames: 'collector.mjs',
      },
    },
  },
  // The image contains one reviewed JavaScript artifact and no node_modules.
  // Bundle both workspace source and the pinned NATS transport so a source
  // checkout cannot become an undeclared runtime dependency.
  ssr: { noExternal: true },
});
