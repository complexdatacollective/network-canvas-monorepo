import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, mergeConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { createPostHogSourceMapsPlugin } from '../../scripts/posthog-source-maps-plugin.ts';
import {
  createPwaCacheReclamationPlugin,
  getPwaCacheReclamationScriptFileName,
} from '../../scripts/pwa-cache-reclamation-plugin.ts';
import { appVersion, createRendererConfig } from './vite.renderer.config';

const here = dirname(fileURLToPath(import.meta.url));
// This ID belongs to the generated bundle, not just its package release. Dev
// deploys can publish several different bundles at the same package version;
// sharing a precache between them would let the newer worker prune files that
// a still-open interview needs. Turbo's task fingerprint makes its
// built/restored artifacts deterministic; direct Vite builds get a one-off
// namespace.
const pwaBuildId = process.env.TURBO_HASH
  ? `turbo-${process.env.TURBO_HASH}`
  : `direct-${randomUUID()}`;
const pwaCacheId = `interviewer-${appVersion}-${pwaBuildId}`;
const pwaCacheReclamationScript =
  getPwaCacheReclamationScriptFileName(pwaCacheId);
// The app background (theme-base scheme-dark --background, oklch(0.28 0.09 281)
// as sRGB). Drives the installed-PWA titlebar (with index.html's theme-color
// meta, which must match) and the splash background.
const themeColor = '#232053';
const backgroundColor = '#232053';

// The @codaco/interview engine chunk is well past workbox's 2 MB default.
// Raise the precache ceiling so no critical JS is silently dropped from
// precache (which would break the offline boot). assert-pwa-build.mjs
// re-checks that nothing critical was excluded.
const MAX_PRECACHE_BYTES = 12 * 1024 * 1024;

// PostHog needs source maps to symbolicate the exceptions posthog-js reports
// (see src/lib/analytics/client.ts). The credentials are set only on the
// production release job (.github/workflows/ci-and-release.yml), so every other
// build — local, PR, Netlify preview — emits no maps at all. When they are
// emitted they are `hidden` (no sourceMappingURL comment, so a browser never
// requests them), and the plugin deletes them from dist once uploaded, so the
// deployed site never serves a map and the workbox precache globs (js/css/html)
// never see one. Both variables are declared in turbo.json's build `env` so an
// uploading build can never reuse a non-uploading cache entry.
const posthogPersonalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const posthogProjectId = process.env.POSTHOG_PROJECT_ID;
const posthogCliBinaryPath = process.env.POSTHOG_CLI_BINARY_PATH;
const uploadSourceMaps = !!posthogPersonalApiKey && !!posthogProjectId;

export default defineConfig(() =>
  mergeConfig(createRendererConfig({ outDir: 'dist', port: 5180 }), {
    define: {
      __PWA_BUILD_ID__: JSON.stringify(pwaCacheId),
    },
    plugins: [
      createPwaCacheReclamationPlugin({
        appCachePrefix: 'interviewer-',
        buildId: pwaCacheId,
      }),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        strategies: 'generateSW',
        devOptions: { enabled: false },
        pwaAssets: { config: true },
        manifest: {
          name: 'Network Canvas Interviewer',
          short_name: 'Interviewer',
          description:
            'Conduct Network Canvas interviews — offline and installable.',
          theme_color: themeColor,
          background_color: backgroundColor,
          display: 'standalone',
          start_url: '/',
          scope: '/',
          // Listed explicitly so the maskable entry can point at its own
          // artwork: pwa-assets generates the full-bleed `any` icons from
          // public/interviewer-icon.png, while the maskable icon is committed
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
          // Register the installed app as a .netcanvas opener (Chromium
          // desktop File Handling API; Safari has no equivalent). Launched
          // files arrive via window.launchQueue — see
          // src/lib/pwa/fileLaunchQueue.ts. focus-existing keeps a single
          // window: an already-open app receives the file instead of a new
          // window spawning.
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
          importScripts: [pwaCacheReclamationScript],
          // Every built bundle keeps its own precache. Activation moves every
          // client already using this registration onto the new worker, so the
          // exact-hash asset route below must still be able to read an older
          // bundle's retained precache (including between same-version dev
          // deploys and while offline).
          cacheId: pwaCacheId,
          globPatterns: ['**/*.{js,css,html}'],
          // The Development protocol's bundled asset chunk (~33 MB, embeds a
          // 23 MB dev-only video — see bundledDevelopmentProtocol.ts) is only
          // ever fetched via a DEV-gated dynamic import(); production users
          // never load it. It also exceeds MAX_PRECACHE_BYTES, which makes
          // generateSW hard-fail the build (not just skip the file) unless
          // it's excluded from the precache glob outright.
          globIgnores: ['**/assets/bundledDevelopmentProtocol-*.js'],
          // vite-plugin-pwa defaults this to index.html; disable it so it
          // cannot shadow the runtime navigation route below.
          navigateFallback: undefined,
          // Without this, precacheAndRoute maps root launches (`/`) to the
          // cached index.html before the runtime navigation route can fetch
          // the newest shell.
          directoryIndex: null,
          // Keep older build caches while an open interview can still request
          // its lazy chunks. `clientsClaim: false` avoids claiming pages that
          // were not already controlled; skipWaiting activation still advances
          // all clients that already use this registration.
          cleanupOutdatedCaches: false,
          clientsClaim: false,
          maximumFileSizeToCacheInBytes: MAX_PRECACHE_BYTES,
          runtimeCaching: [
            {
              // Active interviews deliberately skip update activation to avoid
              // interrupting participants. Keep those navigations on the
              // active worker's precached shell so its HTML and hashed chunks
              // stay from the same deploy, including after a controlled reload
              // or deep link under /interview/.
              urlPattern: ({ request, sameOrigin, url }) =>
                sameOrigin &&
                request.mode === 'navigate' &&
                url.pathname.startsWith('/interview/'),
              handler: 'CacheOnly',
              options: {
                // This shared runtime cache intentionally remains empty.
                // CacheOnly throws on its miss, which invokes
                // PrecacheFallbackPlugin.handlerDidError and returns the
                // active worker's own precached shell without a network read.
                cacheName: 'interviewer-interview-navigation',
                precacheFallback: { fallbackURL: 'index.html' },
              },
            },
            {
              // The app shell must be fresh when the app is launched online:
              // a cache-first navigation fallback would render the old HTML
              // first, then refresh once the service-worker update finished.
              // The handler keeps offline launch via the precached fallback
              // while preventing a still-old service worker from caching new
              // HTML whose matching hashed chunks it has not precached. The
              // /interview/ route above is intentionally excluded because it
              // cannot activate an update without interrupting an interview.
              urlPattern: ({ request, sameOrigin, url }) =>
                sameOrigin &&
                request.mode === 'navigate' &&
                !url.pathname.startsWith('/interview/'),
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
                precacheFallback: { fallbackURL: 'index.html' },
              },
            },
            {
              // skipWaiting activation advances every already-controlled tab,
              // including an interview that deliberately did not request the
              // update. If its old bundle later imports an old lazy chunk, the
              // new worker can read that exact content-hashed JS/CSS URL from
              // the retained precache. Stable HTML is intentionally excluded.
              urlPattern: ({ sameOrigin, url }) =>
                sameOrigin &&
                url.pathname.startsWith('/assets/') &&
                /\.(?:js|css)$/i.test(url.pathname),
              handler: async ({ request }) => {
                const cacheStorage = Reflect.get(globalThis, 'caches') as {
                  match: (request: Request) => Promise<Response | undefined>;
                };
                return (await cacheStorage.match(request)) ?? fetch(request);
              },
            },
            {
              // Stable PWA icons are replaced in place and must reach the
              // network so their no-store response headers can take effect.
              // Other images keep the existing bounded offline cache.
              urlPattern: ({ url }) =>
                /\.(?:png|jpg|jpeg|svg|webp|gif)$/i.test(url.pathname) &&
                ![
                  '/apple-touch-icon-180x180.png',
                  '/pwa-64x64.png',
                  '/pwa-192x192.png',
                  '/pwa-512x512.png',
                  '/maskable-icon-512x512.png',
                  '/interviewer-icon.png',
                ].includes(url.pathname),
              handler: 'CacheFirst',
              options: {
                cacheName: 'interviewer-images',
                expiration: {
                  maxEntries: 400,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\.(?:woff2?|ttf|otf|eot)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'interviewer-fonts',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Mapbox tiles + search are NETWORK-ONLY (ToS + volume). Never
              // cached: offline Geospatial degrades to a warning + stage error
              // (Workstream D), it must not silently serve stale tiles.
              urlPattern: ({ url }) =>
                url.hostname.endsWith('.mapbox.com') ||
                url.hostname === 'api.mapbox.com' ||
                url.hostname === 'events.mapbox.com',
              handler: 'NetworkOnly',
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
              cliBinaryPath: posthogCliBinaryPath,
              sourcemaps: {
                enabled: true,
                releaseName: 'Interviewer',
                releaseVersion: appVersion,
                deleteAfterUpload: true,
              },
            }),
          ]
        : []),
    ],
    // The interview engine is large; splitting it into its own named chunk
    // keeps the precached entry well under MAX_PRECACHE_BYTES. `@codaco/interview`
    // is a pnpm workspace package symlinked into node_modules; Vite/rolldown
    // resolve module ids to the symlink's real path (`packages/interview/src/...`),
    // not the package-name path, so the id never contains the string
    // "@codaco/interview" — match the workspace path segment instead.
    build: {
      rollupOptions: {
        input: { main: resolve(here, 'index.html') },
        output: {
          manualChunks(id: string) {
            if (id.includes('/packages/interview/')) return 'interview-engine';
            return undefined;
          },
        },
      },
    },
  }),
);
