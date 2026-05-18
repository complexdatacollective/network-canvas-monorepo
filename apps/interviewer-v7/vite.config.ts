import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
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
});
