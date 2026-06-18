import { resolve } from 'node:path';

import {
  defineConfig,
  externalizeDepsPlugin,
  type UserConfig,
} from 'electron-vite';

import { createRendererConfig } from './vite.renderer.config';

export default defineConfig(
  (): UserConfig => ({
    main: {
      // electron-updater is bundled (not externalized) into the main process.
      // The electron-builder `files` config excludes node_modules except the
      // native binaries, and under pnpm electron-updater's transitive closure
      // isn't top-level-symlinked, so it can't be re-included by glob — bundling
      // pulls its pure-JS dependency tree into index.cjs instead.
      plugins: [externalizeDepsPlugin({ exclude: ['electron-updater'] })],
      build: {
        outDir: 'dist-electron/main',
        rollupOptions: {
          input: resolve(__dirname, 'electron/main.ts'),
          output: {
            format: 'cjs',
            entryFileNames: 'index.cjs',
          },
        },
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        outDir: 'dist-electron/preload',
        rollupOptions: {
          input: resolve(__dirname, 'electron/preload.ts'),
          output: {
            format: 'cjs',
            entryFileNames: 'index.cjs',
          },
        },
      },
    },
    renderer: {
      root: '.',
      ...createRendererConfig({
        outDir: 'dist-electron/renderer',
        port: 5181,
        rollupInput: resolve(__dirname, 'index.html'),
      }),
    },
  }),
);
