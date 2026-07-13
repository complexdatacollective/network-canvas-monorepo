import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Art',
      fileName: 'index',
      formats: ['es', 'cjs'],
    },
    rolldownOptions: {
      external: ['react', 'react-dom', 'motion'],
      output: {
        globals: {
          'react': 'React',
          'react-dom': 'ReactDOM',
          'motion': 'motion',
        },
      },
    },
  },
  plugins: [
    react(),
    dts({
      bundleTypes: true,
    }),
  ],
  oxc: {
    jsx: { runtime: 'automatic' },
  },
});
