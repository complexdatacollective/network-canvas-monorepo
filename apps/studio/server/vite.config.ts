import { defineConfig } from 'vite';

import { studioSourceMaps } from '../scripts/telemetry-plugins.ts';
import { version } from './package.json';

// Server bundle. npm dependencies stay external (installed in the Docker image
// via `pnpm deploy`); workspace packages must be bundled, because `pnpm deploy`
// installs them as source and Node refuses to type-strip under node_modules —
// anything left external here dies at boot in the image.
export default defineConfig(({ mode }) => ({
  plugins: studioSourceMaps(mode, import.meta.dirname, version),
  build: {
    ssr: true,
    rolldownOptions: {
      input: {
        index: 'src/index.ts',
        migrate: 'src/migrate.ts',
        encryption: 'src/encryption.ts',
        backup: 'src/backup.ts',
        configure: 'src/configure.ts',
        diagnostics: 'src/diagnostics.ts',
      },
    },
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
      // protocol-validation bundles JSZip in its published output, but this
      // source-first consumer compiles it here. Its devDependency is absent
      // from pnpm deploy --prod, so leaving the import external breaks boot.
      'jszip',
    ],
  },
}));
