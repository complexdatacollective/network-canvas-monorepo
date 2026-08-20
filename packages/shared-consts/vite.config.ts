import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SharedConsts',
      fileName: 'index',
      formats: ['es', 'cjs'],
    },
    rolldownOptions: {
      external: ['zod'],
      output: {
        globals: {
          zod: 'zod',
        },
      },
    },
  },
  plugins: [
    // No `bundleTypes`: that route runs the declarations through API
    // Extractor, which ships its own TypeScript (5.9/6.0) and cannot resolve
    // globals from the workspace's (7.x) lib — `ensureError`'s `Error` return
    // type alone fails the build with "Unable to follow symbol". Emitting a
    // `.d.ts` per module needs no second type system, and is what every other
    // package here already does.
    dts({
      // `src` only: the tsconfig also includes `*.ts` so the config files
      // here are typechecked, and without this their declarations ship too.
      include: ['src'],
      // `dist/index.d.ts` is where `publishConfig.types` points.
      insertTypesEntry: true,
    }),
  ],
});
