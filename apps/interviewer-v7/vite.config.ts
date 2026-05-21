import { defineConfig } from 'vite';

import { createRendererConfig } from './vite.renderer.config';

export default defineConfig(({ command }) =>
  createRendererConfig({
    command,
    outDir: 'dist',
    port: 5180,
  }),
);
