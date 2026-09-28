import { defineConfig } from 'vite';

// Server bundle. npm dependencies stay external (installed in the Docker image
// via `pnpm deploy`); workspace packages must be bundled, because `pnpm deploy`
// installs them as source and Node refuses to type-strip under node_modules —
// anything left external here dies at boot in the image.
//
// Five entries, one image (#1895, #1909, #1900, #1901): `dist/index.js` serves
// users, `dist/worker.js` runs background jobs, `dist/migrate.js` creates the
// schema, `dist/maintenance.js` opens and closes a maintenance window, and
// `dist/rotate-secrets.js` re-keys the stored secrets and exits. The
// image's entrypoint (`bin/studio-api`) `exec`s one of them per run, so a
// deployment names a command rather than a path into this bundle. `ssr: true`
// rather than a path, because the entries are named by `rollupOptions.input`
// — a string would name only one of them.
export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node24',
    rollupOptions: {
      input: {
        'index': 'src/index.ts',
        'worker': 'src/worker.ts',
        'migrate': 'src/migrate.ts',
        'maintenance': 'src/maintenance.ts',
        'rotate-secrets': 'src/rotate-secrets.ts',
      },
      output: {
        // Beside the entries, not under `assets/`. Several entries mean rollup
        // emits chunks for what they share, and src/version.ts resolves
        // `../package.json` against its own module URL while src/migrate.ts
        // resolves `./schema-ddl.json` against its — so every emitted file has
        // to stay exactly one level below the package root, as dist/index.js
        // always was. A shared chunk one level deeper reads dist/package.json
        // and fails at boot in the image.
        chunkFileNames: '[name]-[hash].js',
      },
    },
  },
  ssr: {
    noExternal: [
      '@codaco/protocol-validation',
      '@codaco/shared-consts',
      '@codaco/studio-rpc',
      '@codaco/studio-sync',
      // protocol-validation's source imports jszip at load time. The image
      // installs with `pnpm deploy --prod --legacy`, which keeps workspace
      // packages as symlinks and never installs their dependencies, so the
      // import must be inlined here or the container fails at boot.
      'jszip',
    ],
  },
});
