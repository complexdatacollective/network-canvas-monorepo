import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { appI18n } from '@codaco/app-i18n/vite';

export default defineConfig({
  root: fileURLToPath(new URL('./src/account/', import.meta.url)),
  base: '/account/',
  plugins: [...appI18n(), react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { exclude: ['@codaco/fresco-ui', '@codaco/app-i18n'] },
  build: { outDir: '../../dist/account', emptyOutDir: true, manifest: true },
});
