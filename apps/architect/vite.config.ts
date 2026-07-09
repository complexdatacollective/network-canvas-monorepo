import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

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
      react({}),
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
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/preview\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching: [
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
    ],
    build: {
      rollupOptions: {
        input: {
          main: resolve(rootDir, 'index.html'),
          preview: resolve(rootDir, 'preview/index.html'),
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      // Parallelised with the rest of the workspace's tests in the CI quality
      // job; a borderline jsdom test can be starved past the 5s default under
      // peak runner load, so give generous headroom.
      testTimeout: 20_000,
      setupFiles: ['./src/test-setup.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      // Honour the app's own analytics gate (analytics.ts) so PostHog doesn't
      // init a real client (in debug mode) against the production host during
      // unit tests, spamming stderr with config dumps and $pageview payloads.
      env: {
        VITE_DISABLE_ANALYTICS: 'true',
      },
    },
  };
});
