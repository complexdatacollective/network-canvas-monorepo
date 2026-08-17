import { defineConfig } from 'vite';

// Server bundle. npm dependencies stay external (installed in the Docker
// image via `pnpm deploy`); the server's own source and the workspace
// packages it imports at runtime are bundled, so the production artifact
// carries no raw workspace TypeScript — `pnpm deploy` installs those packages
// as their source directories, and Node refuses to type-strip under
// node_modules, so anything left external here dies at boot in the image.
export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node24',
  },
  ssr: {
    noExternal: ['@codaco/studio-rpc', '@codaco/studio-sync'],
  },
});
