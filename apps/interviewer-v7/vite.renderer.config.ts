import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin, UserConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const frescoUiSrc = resolve(here, '../../packages/fresco-ui/src');

// Inject the app version from package.json at build time. Read here once
// (rather than imported as JSON) so the renderer bundle gets a single
// inlined string and TypeScript doesn't need package.json on its include
// path. Consumed via the ambient `__APP_VERSION__` declared in global.d.ts.
const appVersion = JSON.parse(
  readFileSync(resolve(here, 'package.json'), 'utf8'),
).version as string;

// Production CSP injected into index.html as a meta tag for the web build and
// the Capacitor build (which copies the same dist/). Electron's response-header
// CSP (in electron/main.ts) must mirror this — the browser intersects header
// and meta, so divergence silently breaks the renderer. Vite HMR needs
// 'unsafe-eval' / inline scripts in dev, so this is build-only.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
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
  command: 'build' | 'serve';
  outDir: string;
  port?: number;
  emptyOutDir?: boolean;
  // Override the rollup entry. Defaults to Vite's index.html in the project
  // root; the electron renderer uses this to explicitly point at index.html
  // from inside the electron-vite renderer slice.
  rollupInput?: string;
};

// Shared renderer-side Vite config used by both the web build (vite.config.ts)
// and the Electron renderer slice (electron.vite.config.ts). Keeping it in one
// place prevents drift — e.g. updating Swiper / Tailwind plugin / resolve.dedupe
// in only one config and ending up with two divergent dev pipelines.
export function createRendererConfig({
  command,
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
      alias:
        command === 'serve'
          ? [
              {
                find: /^@codaco\/fresco-ui\/(.+)$/,
                replacement: `${frescoUiSrc}/$1`,
              },
            ]
          : [],
    },
    optimizeDeps: {
      // Pre-bundle Swiper React together with React so Vite's optimizer
      // resolves both against the same React instance. Without this, a
      // stale dep cache can carry over a separately-bundled copy.
      include: ['swiper', 'swiper/react'],
    },
    plugins: [react(), tailwindcss(), injectCspMeta()],
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
