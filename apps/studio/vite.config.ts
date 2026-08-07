import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

// Client SPA build. In development this config is not used directly: the Hono
// server (server/src/dev.ts) mounts Vite in middleware mode so the SPA, the
// API, and the app WebSocket endpoint are all served by one process on one
// port — dev/prod parity for the single-artifact topology decided in the
// framework ADR (#1245).
export default defineConfig({
  root: resolve(here, 'client'),
  plugins: [react(), tailwindcss()],
  resolve: {
    // pnpm can hand prebundled deps a different React copy than the host app
    // uses, which produces "Invalid hook call". Dedupe to keep a single React
    // instance across the bundle graph.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Workspace packages resolve to raw TypeScript source; excluded from
    // pre-bundling so Vite transforms them through its own pipeline rather
    // than attempting to pre-bundle them.
    exclude: ['@codaco/fresco-ui'],
  },
  build: {
    outDir: resolve(here, 'dist/client'),
    emptyOutDir: true,
  },
});
