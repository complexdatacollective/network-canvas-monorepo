import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js'),
        },
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    define: {
      // Provide module shim for libraries that check module.hot (like redux-form)
      'module.hot': 'undefined',
    },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true,
      },
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html'),
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '~': resolve(__dirname, 'node_modules'),
        // Shim for react-resize-aware which has a broken build (uses jsx without importing it)
        'react-resize-aware': resolve(
          __dirname,
          'src/shims/react-resize-aware.js',
        ),
      },
    },
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      include: ['react-resize-aware', '@codaco/ui'],
      // protocol-validation dynamically imports ./schemas/<version>.js at runtime;
      // the dep optimizer can't follow that, so serve it unbundled.
      exclude: ['@codaco/protocol-validation'],
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
          silenceDeprecations: [
            'import',
            'global-builtin',
            'legacy-js-api',
            'color-functions',
            'mixed-decls',
            'slash-div',
            'if-function',
          ],
          loadPaths: [
            resolve(__dirname, 'src/styles'),
            resolve(__dirname, 'node_modules'),
          ],
        },
      },
    },
    server: {
      port: 3000,
    },
  },
});
