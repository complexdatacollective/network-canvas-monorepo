import { defineConfig } from 'vite';

// Server bundle. npm dependencies stay external (installed in the Docker
// image via `pnpm deploy`); the server's own source and the
// @codaco/studio-rpc boundary package are bundled, so the production
// artifact carries no raw workspace TypeScript.
export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node24',
  },
  ssr: {
    noExternal: ['@codaco/studio-rpc'],
  },
});
