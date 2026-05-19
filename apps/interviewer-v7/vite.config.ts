import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const frescoUiSrc = resolve(here, '../../packages/fresco-ui/src');

export default defineConfig(({ command }) => ({
  resolve: {
    tsconfigPaths: true,
    alias:
      command === 'serve'
        ? [
            {
              find: /^@codaco\/fresco-ui\/(.+)$/,
              replacement: `${frescoUiSrc}/$1`,
            },
          ]
        : [],
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: false,
    host: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
