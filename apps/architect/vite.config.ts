import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import posthogSourceMaps from '@posthog/rollup-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
  "script-src 'self'",
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
          globPatterns: ['**/*.{js,css,html}'],
          // vite-plugin-pwa defaults this to index.html; disable it so it
          // cannot shadow the runtime navigation route below.
          navigateFallback: undefined,
          // Without this, precacheAndRoute maps root launches (`/`) to the
          // cached index.html before the runtime navigation route can fetch
          // the newest shell.
          directoryIndex: null,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
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
              handler: async ({ request }) => {
                let timeoutId: ReturnType<typeof setTimeout> | undefined;

                try {
                  const networkTimeout = new Promise<Response>((_, reject) => {
                    timeoutId = setTimeout(
                      () => reject(new Error('Preview request timed out')),
                      3_000,
                    );
                  });

                  return await Promise.race([fetch(request), networkTimeout]);
                } catch (error) {
                  const cacheStorage: unknown = Reflect.get(
                    globalThis,
                    'caches',
                  );
                  const serviceWorkerLocation: unknown = Reflect.get(
                    globalThis,
                    'location',
                  );
                  const cacheMatch: unknown =
                    typeof cacheStorage === 'object' && cacheStorage !== null
                      ? Reflect.get(cacheStorage, 'match')
                      : undefined;
                  const locationHref: unknown =
                    typeof serviceWorkerLocation === 'object' &&
                    serviceWorkerLocation !== null
                      ? Reflect.get(serviceWorkerLocation, 'href')
                      : undefined;

                  if (
                    typeof cacheMatch !== 'function' ||
                    typeof locationHref !== 'string'
                  ) {
                    throw error;
                  }

                  const fallback: unknown = await cacheMatch.call(
                    cacheStorage,
                    new URL('preview/index.html', locationHref).href,
                    { ignoreSearch: true },
                  );
                  if (fallback instanceof Response) return fallback;
                  throw error;
                } finally {
                  if (timeoutId !== undefined) clearTimeout(timeoutId);
                }
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
              handler: async ({ request }) => {
                let timeoutId: ReturnType<typeof setTimeout> | undefined;

                try {
                  const networkTimeout = new Promise<Response>((_, reject) => {
                    timeoutId = setTimeout(
                      () => reject(new Error('Navigation request timed out')),
                      3_000,
                    );
                  });

                  return await Promise.race([fetch(request), networkTimeout]);
                } catch (error) {
                  const cacheStorage: unknown = Reflect.get(
                    globalThis,
                    'caches',
                  );
                  const serviceWorkerLocation: unknown = Reflect.get(
                    globalThis,
                    'location',
                  );
                  const cacheMatch: unknown =
                    typeof cacheStorage === 'object' && cacheStorage !== null
                      ? Reflect.get(cacheStorage, 'match')
                      : undefined;
                  const locationHref: unknown =
                    typeof serviceWorkerLocation === 'object' &&
                    serviceWorkerLocation !== null
                      ? Reflect.get(serviceWorkerLocation, 'href')
                      : undefined;

                  if (
                    typeof cacheMatch !== 'function' ||
                    typeof locationHref !== 'string'
                  ) {
                    throw error;
                  }

                  const fallback: unknown = await cacheMatch.call(
                    cacheStorage,
                    new URL('index.html', locationHref).href,
                    { ignoreSearch: true },
                  );
                  if (fallback instanceof Response) return fallback;
                  throw error;
                } finally {
                  if (timeoutId !== undefined) clearTimeout(timeoutId);
                }
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
      // Last: its writeBundle hook rewrites the emitted chunks (injecting the
      // chunk ids PostHog matches maps by) and must see the final output.
      ...(uploadSourceMaps
        ? [
            posthogSourceMaps({
              personalApiKey: posthogPersonalApiKey,
              projectId: posthogProjectId,
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
