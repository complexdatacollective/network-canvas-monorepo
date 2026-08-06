import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The TanStack Start build for the Phase B migration slice. The Next.js app in
 * `app/` is unchanged and still builds with `next build`; this config builds the
 * ported routes in `src/` instead. Both trees share `lib/`, `actions/`,
 * `queries/`, `schemas/`, and `components/`.
 *
 * `nitroV2Plugin` is what produces `.output/server/index.mjs`. Without a hosting
 * adapter, `vite build` emits only `dist/server/server.js` — a fetch-handler
 * module with no listening server — and the container contract cannot be met.
 */
export default defineConfig({
  resolve: {
    alias: [
      /**
       * `queries/` cannot be ported, only replaced: every function in it is a
       * `'use cache'` function, and TanStack Start has no server-cache
       * primitive. The whole layer is swapped here for the uncached
       * equivalents in `src/server/queries/`, so call sites in `lib/` stay
       * untouched and shared with the Next.js tree. `tsc` resolves the real
       * module, so the replacements are typechecked against the contract they
       * are standing in for.
       */
      {
        find: /^~\/queries\/appSettings$/,
        replacement: path.resolve(
          import.meta.dirname,
          'src/server/queries/appSettings.ts',
        ),
      },
      {
        find: /^~\/queries\/interviews$/,
        replacement: path.resolve(
          import.meta.dirname,
          'lib/queries/interviews.ts',
        ),
      },
      {
        find: /^~\/queries\/protocols$/,
        replacement: path.resolve(
          import.meta.dirname,
          'lib/queries/protocols.ts',
        ),
      },
      /**
       * The navigation and image primitives. Under Next these are `next/link`
       * and `next/image`; under Start they are TanStack Router's `Link` and a
       * plain `<img>`. One alias keeps every shared client component free of
       * `next/*` imports — without it a single `next/link` pulls Next's client
       * runtime into the browser bundle.
       */
      {
        find: /^~\/components\/ui\/nav$/,
        replacement: path.resolve(
          import.meta.dirname,
          'src/components/nav.tsx',
        ),
      },
      { find: '~', replacement: path.resolve(import.meta.dirname) },
    ],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({ importProtection: { maxTraceDepth: 30, log: 'always' } }),
    nitroV2Plugin({ preset: 'node-server', compatibilityDate: '2026-08-06' }),
    react(),
  ],
});
