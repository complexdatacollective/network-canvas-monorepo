import { readFileSync } from 'node:fs';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { Schema } from 'effect';
import { defineConfig, type Plugin } from 'vite';

import { appI18n } from '@codaco/app-i18n/vite';

// The server the dev proxy targets — @codaco/studio-api's default port,
// overridable so a second checkout can run its own pair. Both halves have to
// agree: give the server the same port through `PORT`.
const SERVER_ORIGIN =
  process.env.STUDIO_SERVER_ORIGIN ?? 'http://localhost:3000';

const WITHOUT_POSTHOG = '\0studio-without-posthog';

const withoutPostHog: Plugin = {
  name: 'studio-without-posthog',
  enforce: 'pre',
  resolveId: (source) =>
    /^posthog-js(?:\/|$)/.test(source) ? WITHOUT_POSTHOG : null,
  load: (id) =>
    id === WITHOUT_POSTHOG
      ? 'throw new Error("posthog-js is not part of Network Canvas Studio");'
      : null,
};

const posthogPersonalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const posthogProjectId = process.env.POSTHOG_PROJECT_ID;
const posthogCliBinaryPath = process.env.POSTHOG_CLI_BINARY_PATH;

const sourceMapUpload = async (): Promise<Plugin[]> => {
  if (!posthogPersonalApiKey || !posthogProjectId) return [];
  const { createPostHogSourceMapsPlugin } =
    await import('../../../scripts/buildtime/posthog-source-maps-plugin.ts');
  const { version } = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
  )(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  return [
    createPostHogSourceMapsPlugin({
      personalApiKey: posthogPersonalApiKey,
      projectId: posthogProjectId,
      cliBinaryPath: posthogCliBinaryPath,
      sourcemaps: {
        enabled: true,
        releaseName: 'Studio',
        releaseVersion: version,
        deleteAfterUpload: true,
      },
    }),
  ];
};

// Client SPA. In development the Vite dev server plays the role the CDN plays
// in the managed topology (#1245): it serves the SPA and routes the server's
// paths to the server process, so the browser sees a single origin in every
// topology. Run both halves:
//
//   pnpm --filter @codaco/studio-api dev
//   pnpm --filter @codaco/studio-web dev
export default defineConfig(async () => ({
  plugins: [
    // Pre-parses every message at build time — defineMessages defaults via
    // the oxc-based formatjs transform, imported locale catalogs likewise —
    // and drops the ICU parser from production bundles.
    ...appI18n(),
    react(),
    tailwindcss(),
    withoutPostHog,
    ...(await sourceMapUpload()),
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
      '@codaco/effect-query',
      '@codaco/fresco-ui',
      '@codaco/protocol-builder',
      '@codaco/protocol-builder-core',
      '@codaco/studio-contract',
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
}));
