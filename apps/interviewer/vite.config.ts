import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, mergeConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { createRendererConfig } from './vite.renderer.config';

const here = dirname(fileURLToPath(import.meta.url));
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

export default defineConfig(() =>
  mergeConfig(createRendererConfig({ outDir: 'dist', port: 5180 }), {
    plugins: [
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
          cleanupOutdatedCaches: true,
          clientsClaim: true,
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
              handler: async () => {
                const cacheStorage: unknown = Reflect.get(globalThis, 'caches');
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
                  throw new Error('Unable to read precached interview shell');
                }

                const fallback: unknown = await cacheMatch.call(
                  cacheStorage,
                  new URL('index.html', locationHref).href,
                  { ignoreSearch: true },
                );
                if (fallback instanceof Response) return fallback;
                throw new Error('Missing precached interview shell');
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
