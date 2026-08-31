import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { createPostHogSourceMapsPlugin } from '../../scripts/posthog-source-maps-plugin.ts';
import { version } from './package.json';
import { createProtocolSourceAuthoringPlugin } from './scripts/protocol-source-authoring';

const rootDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(rootDir, '../..');

// The Content-Security-Policy directives a <meta http-equiv> can express — i.e.
// everything except frame-ancestors, which is header-only and stays in
// public/_headers. It is injected into the built HTML (see injectCspMeta) rather
// than served purely as an HTTP header so that a change to it rides the service
// worker's content-revisioning: because the app precaches its HTML shell, a
// header-only CSP change is frozen in the cached response and never reaches
// already-installed clients, whereas a change to this in-content policy alters
// the HTML, bumps its precache revision, and propagates on the next update.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // posthog-js loads its remote project config and enabled SDK extensions
  // (including exception autocapture) as scripts from our controlled relay.
  "script-src 'self' https://ph-relay.networkcanvas.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' data: blob: https://api.github.com https://api.mapbox.com https://events.mapbox.com https://ph-relay.networkcanvas.com",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
].join('; ');

// Inject the CSP as the first <head> tag of every built HTML entry so it governs
// every resource parsed after it. Build-only: in dev a <meta> CSP would block
// Vite's HMR / react-refresh (inline + eval) scripts and the HMR websocket, and
// the dev server serves no _headers anyway.
const injectCspMeta = (): Plugin => ({
  name: 'architect-inject-csp-meta',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    handler: () => [
      {
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          'content': CONTENT_SECURITY_POLICY,
        },
        injectTo: 'head-prepend',
      },
    ],
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  // This ID belongs to the generated bundle, not just its package release. Dev
  // deploys can publish several different bundles at the same package version;
  // sharing a precache between them would let the newer worker prune files that
  // a still-open tab needs. Turbo's task fingerprint makes its built/restored
  // artifacts deterministic; direct Vite builds get a one-off namespace.
  const pwaBuildId = env.TURBO_HASH
    ? `turbo-${env.TURBO_HASH}`
    : `direct-${randomUUID()}`;
  const pwaCacheId = `architect-${version}-${pwaBuildId}`;

  // PostHog needs source maps to symbolicate the exceptions posthog-js reports
  // (see src/analytics.ts). The credentials are set only on the production
  // release job (.github/workflows/ci-and-release.yml), so every other build —
  // local, PR, Netlify preview — emits no maps at all. When they are emitted
  // they are `hidden` (no sourceMappingURL comment, so a browser never requests
  // them), and the plugin deletes them from dist once uploaded, so the deployed
  // site never serves a map. Both variables are declared in turbo.json's build
  // `env` so an uploading build can never reuse a non-uploading cache entry.
  const posthogPersonalApiKey = env.POSTHOG_PERSONAL_API_KEY;
  const posthogProjectId = env.POSTHOG_PROJECT_ID;
  const posthogCliBinaryPath = env.POSTHOG_CLI_BINARY_PATH;
  const uploadSourceMaps = !!posthogPersonalApiKey && !!posthogProjectId;

  return {
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      injectCspMeta(),
      createProtocolSourceAuthoringPlugin({
        repoRoot,
        enabled: env.VITE_PROTOCOL_SOURCE_AUTHORING === 'true',
      }),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        strategies: 'generateSW',
        devOptions: { enabled: false },
        pwaAssets: { config: true },
        manifest: {
          name: 'Network Canvas Architect',
          short_name: 'Architect',
          description: 'Design Network Canvas interview protocols.',
          theme_color: '#00b38f',
          background_color: '#edf2f8',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          // Listed explicitly so the maskable entry can point at its own
          // artwork: pwa-assets generates the full-bleed `any` icons from
          // public/architect-icon.png, while the maskable icon is committed
          // separately at 0.85 scale (see pwa-assets.config.ts). Declaring
          // `icons` also stops the generator overwriting this list.
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          // Register the installed app as a .netcanvas opener/editor (Chromium
          // desktop File Handling API; Safari has no equivalent, and the web
          // manifest has no viewer/editor role field — the role is functional:
          // Architect opens the file for editing). Launched files arrive via
          // window.launchQueue — see src/utils/fileLaunchQueue.ts.
          launch_handler: { client_mode: 'focus-existing' },
          file_handlers: [
            {
              action: '/',
              accept: { 'application/octet-stream': ['.netcanvas'] },
            },
          ],
        },
        workbox: {
          // App and worker maps are uploaded before Workbox runs. The service
          // worker itself is not part of PostHog's browser error reporting.
          sourcemap: false,
          // Every built bundle keeps its own precache. A newly activated worker
          // must not prune hashed lazy assets that an older, still-open
          // Architect tab can need (including between same-version dev deploys
          // and while offline).
          cacheId: pwaCacheId,
          globPatterns: ['**/*.{js,css,html}'],
          // vite-plugin-pwa defaults this to index.html; disable it so it
          // cannot shadow the runtime navigation route below.
          navigateFallback: undefined,
          // Without this, precacheAndRoute maps root launches (`/`) to the
          // cached index.html before the runtime navigation route can fetch
          // the newest shell.
          directoryIndex: null,
          // Old controllers retain their versioned precaches until the browser
          // evicts them; claiming their clients or deleting their caches would
          // strand lazy imports in open editor tabs.
          cleanupOutdatedCaches: false,
          clientsClaim: false,
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching: [
            {
              // Preview is a separate HTML entry. With directoryIndex disabled
              // for fresh root launches, keep /preview/ explicitly mapped to
              // its own precached shell for fully offline preview starts.
              urlPattern: ({ request, sameOrigin, url }) =>
                sameOrigin &&
                request.mode === 'navigate' &&
                url.pathname.startsWith('/preview/'),
              handler: 'NetworkOnly',
              options: {
                plugins: [
                  {
                    requestWillFetch: async ({ request, state }) => {
                      const controller = new AbortController();
                      if (state) {
                        state.navigationTimeoutId = setTimeout(
                          () => controller.abort(),
                          3_000,
                        );
                      }
                      return new Request(request, {
                        signal: controller.signal,
                      });
                    },
                    fetchDidSucceed: async ({ response, state }) => {
                      const timeoutId: unknown = state?.navigationTimeoutId;
                      if (typeof timeoutId === 'number')
                        clearTimeout(timeoutId);
                      return response;
                    },
                    fetchDidFail: async ({ state }) => {
                      const timeoutId: unknown = state?.navigationTimeoutId;
                      if (typeof timeoutId === 'number')
                        clearTimeout(timeoutId);
                    },
                  },
                ],
                // Workbox resolves this through the active worker's
                // PrecacheController. Do not use global caches.match(): old
                // bundle precaches are deliberately retained for older tabs.
                precacheFallback: { fallbackURL: 'preview/index.html' },
              },
            },
            {
              // The app shell must be fresh when the app is launched online:
              // a cache-first navigation fallback would render the old HTML
              // first, then refresh once the service-worker update finished.
              // The handler keeps offline launch via the precached fallback
              // while preventing a still-old service worker from caching new
              // HTML whose matching hashed chunks it has not precached.
              urlPattern: ({ request, sameOrigin, url }) =>
                sameOrigin &&
                request.mode === 'navigate' &&
                !url.pathname.startsWith('/preview/'),
              handler: 'NetworkOnly',
              options: {
                plugins: [
                  {
                    requestWillFetch: async ({ request, state }) => {
                      const controller = new AbortController();
                      if (state) {
                        state.navigationTimeoutId = setTimeout(
                          () => controller.abort(),
                          3_000,
                        );
                      }
                      return new Request(request, {
                        signal: controller.signal,
                      });
                    },
                    fetchDidSucceed: async ({ response, state }) => {
                      const timeoutId: unknown = state?.navigationTimeoutId;
                      if (typeof timeoutId === 'number')
                        clearTimeout(timeoutId);
                      return response;
                    },
                    fetchDidFail: async ({ state }) => {
                      const timeoutId: unknown = state?.navigationTimeoutId;
                      if (typeof timeoutId === 'number')
                        clearTimeout(timeoutId);
                    },
                  },
                ],
                // PrecacheFallbackPlugin reads only this active worker's
                // precache, even though older bundle caches remain available
                // to their existing clients.
                precacheFallback: { fallbackURL: 'index.html' },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|webp|gif)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'architect-images',
                expiration: {
                  maxEntries: 400,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Self-hosted fonts (bundled via @codaco/tailwind-config). Matched
              // before the /assets/ catch-all below so font files get the long
              // one-year expiry.
              urlPattern: /\.(?:woff2?|ttf|otf|eot)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'architect-fonts',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Bundled non-image assets (template / Sample protocol media: video,
              // GeoJSON, CSV, etc.). Content-hashed and same-origin; the JS/CSS in
              // /assets are already precached and served from there first, and
              // Architect has no backend, so caching all of /assets is safe.
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && url.pathname.startsWith('/assets/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'architect-bundled-assets',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
      // Last: its writeBundle hook processes the completed output directory,
      // including worker bundles that Vite emits as assets.
      ...(uploadSourceMaps
        ? [
            createPostHogSourceMapsPlugin({
              personalApiKey: posthogPersonalApiKey,
              projectId: posthogProjectId,
              cliBinaryPath: posthogCliBinaryPath || undefined,
              sourcemaps: {
                enabled: true,
                releaseName: 'Architect',
                releaseVersion: version,
                deleteAfterUpload: true,
              },
            }),
          ]
        : []),
    ],
    build: {
      rollupOptions: {
        input: {
          main: resolve(rootDir, 'index.html'),
          preview: resolve(rootDir, 'preview/index.html'),
        },
      },
    },
  };
});
