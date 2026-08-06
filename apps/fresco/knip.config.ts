import type { KnipConfig } from 'knip';

// NOTE: This file is named knip.config.ts rather than knip.ts (as the docs suggest)
// because of a TS resolution bug: https://github.com/webpro-nl/knip/issues/649

/**
 * Knip configuration file
 *
 * Please make sure to document any exceptions or ignores added here, so future
 * maintainers understand the reasoning behind them!
 */

const config: KnipConfig = {
  project: ['**/*.{js,jsx,ts,tsx}'],
  /**
   * The Phase B migration slice adds a second application tree under `src/`,
   * built by `vite.config.ts` rather than by Next. Knip's Next plugin only
   * knows about `app/`, so the TanStack Start entry points have to be declared:
   * `src/router.tsx` and `src/start.ts` are resolved by the Start plugin at
   * build time, and `src/routes/**` is file-based routing, so nothing in the
   * repo imports any of them by name.
   */
  entry: [
    'src/router.tsx',
    'src/start.ts',
    'src/routes/**/*.{ts,tsx}',
    // Reached only through `resolve.alias` in `vite.config.ts` — they stand in
    // for `~/queries/appSettings` and `~/components/ui/nav` in the Start build,
    // so no source file imports them by path and knip cannot follow the edge.
    'src/server/queries/appSettings.ts',
    'src/components/nav.tsx',
    // Throwaway: seeds a database for exercising the slice by hand.
    'scripts/seed-slice.ts',
  ],
  ignoreDependencies: [
    'sharp', // Used by next/image but not directly imported
    '@tailwindcss/forms', // Used in globals.css but not detected as used
    'tailwindcss-animate', // Used in globals.css but not detected as used
    '@prisma/client', // Used at runtime by Prisma generated client (imports @prisma/client/runtime/client)
  ],
  ignoreBinaries: [
    'netlify', // Installed during CI via pnpm add -g netlify-cli
  ],
  ignoreIssues: {
    // Server actions for passkey password management — UI not yet wired
    'actions/webauthn.ts': ['exports'],

    // Pre-existing unused type exports
    'lib/protocol/validateAndMigrateProtocol.ts': ['types'],

    // Phase B migration slice: the TanStack Start counterparts of Server
    // Actions whose UI is outside the six ported routes. Same reasoning as
    // `actions/webauthn.ts` above — the server side is ported, the call site
    // is in a route the slice excludes.
    'src/server/webauthn.ts': ['exports'],
    'src/server/auth.ts': ['exports'],
  },
};

export default config;
