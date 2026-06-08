import { resolve } from 'node:path';

import { defineConfig } from 'vite';

import { rendererRoot, sharedRendererConfig } from './vite.renderer.shared.js';

export default defineConfig({
  ...sharedRendererConfig,
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
    rollupOptions: { input: resolve(rendererRoot, 'index.html') },
  },
  server: { port: 5181 },
});
