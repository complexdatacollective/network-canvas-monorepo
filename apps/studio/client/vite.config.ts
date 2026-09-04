import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { appI18n } from '@codaco/app-i18n/vite';

// The server the dev proxy targets — @codaco/studio-server's default port,
// overridable so a second checkout can run its own pair. Both halves have to
// agree: give the server the same port through `PORT`.
const SERVER_ORIGIN =
  process.env.STUDIO_SERVER_ORIGIN ?? 'http://localhost:3000';

// Client SPA. In development the Vite dev server plays the role the CDN plays
// in the managed topology (#1245): it serves the SPA and routes the server's
// paths to the server process, so the browser sees a single origin in every
// topology. Run both halves:
//
//   pnpm --filter @codaco/studio-server dev
//   pnpm --filter @codaco/studio-client dev
export default defineConfig({
  plugins: [
    // Pre-parses every message at build time — defineMessages defaults via
    // the oxc-based formatjs transform, imported locale catalogs likewise —
    // and drops the ICU parser from production bundles.
    ...appI18n(),
    react(),
    tailwindcss(),
  ],
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
    exclude: [
      '@codaco/fresco-ui',
      '@codaco/protocol-builder',
      '@codaco/studio-sync',
    ],
  },
  server: {
    proxy: {
      '/api': SERVER_ORIGIN,
      '/rpc': SERVER_ORIGIN,
      '/storage': SERVER_ORIGIN,
      '/healthz': SERVER_ORIGIN,
      '/ws': { target: SERVER_ORIGIN, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
