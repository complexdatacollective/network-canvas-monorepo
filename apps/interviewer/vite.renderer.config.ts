import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin, UserConfig } from 'vite';

import { POSTHOG_HOST } from './src/lib/analytics/config';

const here = dirname(fileURLToPath(import.meta.url));

// The PostHog relay the analytics client connects to at runtime. Derived from
// the same constant the client uses so the CSP can never drift from it.
const POSTHOG_RELAY_ORIGIN = new URL(POSTHOG_HOST).origin;

const ARRAYBUFFER_QUERY_RE = /(\?|&)arraybuffer(?:&|$)/;

// Resolves `import.meta.glob('...', { query: '?arraybuffer', ... })` entries
// (used to bundle the sample/development protocols' media assets — see
// src/lib/protocol/bundledProtocols.ts) into a module exporting the file's raw
// bytes as a `Uint8Array`, inlined as base64 at transform time. Vite has no
// built-in `?arraybuffer` query (only `?url` and `?raw`); `?url` would require
// a runtime `fetch` to read the bytes, which a bundled/offline install must
// never do. Needed by both the app build (vite.renderer.config.ts) and the
// unit tests (vitest.config.ts), so it's exported for both to share.
export function arrayBufferAssetPlugin(): Plugin {
  return {
    name: 'arraybuffer-asset',
    enforce: 'pre',
    load(id) {
      if (!ARRAYBUFFER_QUERY_RE.test(id)) return null;
      const filePath = id.replace(ARRAYBUFFER_QUERY_RE, '').replace(/\?$/, '');
      const base64 = readFileSync(filePath).toString('base64');
      return `
        const binary = atob(${JSON.stringify(base64)});
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        export default bytes.buffer;
      `;
    },
  };
}

// Inject the app version from package.json at build time. Read here once
// (rather than imported as JSON) so the renderer bundle gets a single
// inlined string and TypeScript doesn't need package.json on its include
// path. Consumed via the ambient `__APP_VERSION__` declared in global.d.ts.
const appVersion = JSON.parse(
  readFileSync(resolve(here, 'package.json'), 'utf8'),
).version as string;

// Production CSP injected into index.html as a meta tag. Vite HMR needs
// 'unsafe-eval' / inline scripts in dev, so this is build-only.
//
// connect-src must permit the runtime network egress the app actually makes:
// mapbox-gl fetches styles/tiles/glyphs from api.mapbox.com and posts telemetry
// to events.mapbox.com (Geospatial stages), analytics posts to the PostHog
// relay, and the app-update indicator fetches release notes from
// api.github.com. Protocol roster assets use blob: object URLs. Everything
// else stays 'self'.
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  // Protocol audio/video assets are decrypted to Blobs and played via object
  // URLs, so media needs blob: (default-src 'self' would otherwise block it).
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.github.com https://api.mapbox.com https://events.mapbox.com ${POSTHOG_RELAY_ORIGIN} blob:`,
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

function injectCspMeta(): Plugin {
  const policy = CSP_DIRECTIVES.join('; ');
  return {
    name: 'inject-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
      return html.replace(/<head>/i, `<head>\n    ${meta}`);
    },
  };
}

type RendererOptions = {
  outDir: string;
  port?: number;
  emptyOutDir?: boolean;
  // Override the rollup entry. Defaults to Vite's index.html in the project
  // root.
  rollupInput?: string;
};

// Shared renderer-side Vite config, currently consumed by the web build
// (vite.config.ts). Kept as a single function so config additions — e.g.
// updating Swiper / Tailwind plugin / resolve.dedupe — have one place to land.
export function createRendererConfig({
  outDir,
  port,
  emptyOutDir = true,
  rollupInput,
}: RendererOptions): UserConfig {
  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    resolve: {
      tsconfigPaths: true,
      // pnpm can hand prebundled deps (Swiper React) a different React copy
      // than the host app uses, which produces "Invalid hook call". Dedupe
      // both to keep a single React instance across the bundle graph.
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      // Pre-bundle Swiper React together with React so Vite's optimizer
      // resolves both against the same React instance. Without this, a
      // stale dep cache can carry over a separately-bundled copy.
      include: ['swiper', 'swiper/react'],
      // Workspace packages resolve to raw TypeScript source; excluded from
      // pre-bundling so Vite transforms them through its own pipeline rather
      // than attempting to pre-bundle them.
      exclude: [
        '@codaco/fresco-ui',
        '@codaco/interview',
        '@codaco/network-exporters',
        '@codaco/protocol-utilities',
        '@codaco/protocol-validation',
        '@codaco/shared-consts',
      ],
    },
    plugins: [
      react(),
      tailwindcss(),
      injectCspMeta(),
      arrayBufferAssetPlugin(),
    ],
    server:
      port == null
        ? undefined
        : {
            port,
            strictPort: false,
            host: true,
          },
    build: {
      outDir,
      emptyOutDir,
      ...(rollupInput == null ? {} : { rollupOptions: { input: rollupInput } }),
    },
  };
}
