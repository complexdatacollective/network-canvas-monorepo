import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

// Server bundle: the production entry only (server/src/index.ts). The dev
// entry (server/src/dev.ts) imports Vite for middleware mode and is run
// directly by Node in development — it is deliberately not built, so Vite
// never ends up in the production artifact.
//
// npm dependencies stay external (installed in the Docker image via
// `pnpm deploy`); only Studio's own server source is bundled.
export default defineConfig({
  build: {
    ssr: resolve(here, 'server/src/index.ts'),
    outDir: resolve(here, 'dist/server'),
    emptyOutDir: true,
    target: 'node24',
  },
});
