import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import { version } from './package.json';

const rootDir = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
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
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true,
        silenceDeprecations: [
          'mixed-decls',
          'import',
          'color-functions',
          'global-builtin',
        ],
        verbose: false,
      },
    },
  },
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
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
