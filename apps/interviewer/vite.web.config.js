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
  // host: true (0.0.0.0) so on-device targets can reach the dev server — the
  // Android emulator hits the host via 10.0.2.2, which can't see a localhost-only
  // bind (the iOS sim shares the host loopback, so it works either way).
  // strictPort so a stale server surfaces an error instead of silently shifting
  // the port away from CAP_DEV_SERVER_URL.
  server: { port: 5181, host: true, strictPort: true },
});
