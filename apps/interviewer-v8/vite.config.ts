import { defineConfig } from 'vite';

import { createRendererConfig } from './vite.renderer.config';

export default defineConfig(() =>
  createRendererConfig({
    outDir: 'dist',
    port: 5180,
  }),
);
