import { defineConfig } from 'vite';

// Server bundle. npm dependencies stay external (installed in the Docker image
// via `pnpm deploy`); workspace packages must be bundled, because `pnpm deploy`
// installs them as source and Node refuses to type-strip under node_modules —
// anything left external here dies at boot in the image.
export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node24',
  },
  ssr: {
    noExternal: [
      '@codaco/protocol-validation',
      '@codaco/shared-consts',
      '@codaco/studio-rpc',
      '@codaco/studio-sync',
    ],
  },
});
