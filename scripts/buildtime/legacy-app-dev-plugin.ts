// `vite dev` builds nothing into dist, so it has no dist/v8 for the older
// major to be served from. This module gives the dev server the same pinned
// build a production build bundles: `prepareLegacyAppForDev` verifies and
// extracts the pinned tarball (bundle-legacy-app.mjs, downloading it once into
// the app's node_modules/.cache) into a directory of its own, keyed by the
// pin's sha256 so a new pin extracts afresh, and `createLegacyAppDevPlugin`
// serves that directory under /v8/ the way Netlify serves dist/v8 with the
// app's public/_redirects. The app's `__<APP>_V8__` define says it is there
// only when it is, so a dev server that could not obtain it (offline on first
// run, or `<APP>_SKIP_LEGACY_V8=true`) runs as a build without it does.
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

import type { Plugin } from 'vite';

import { bundleLegacyApp } from './bundle-legacy-app.mjs';
import {
  LEGACY_APP_DIST_DIR,
  type LegacyApp,
  type LegacyAppResolution,
  legacyAppPreviewRoute,
} from './legacy-app.ts';

/**
 * The directory holding the older major's build for the dev server, or null
 * when it is not pinned, is skipped, or could not be obtained (logged; the dev
 * server still starts).
 */
export const prepareLegacyAppForDev = async ({
  app,
  appRoot,
  resolution,
  env = process.env,
  log = (message) => console.warn(`[legacy-${app.name}] ${message}`),
}: {
  app: LegacyApp;
  appRoot: string;
  resolution: LegacyAppResolution;
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
}): Promise<string | null> => {
  if (!resolution.bundled) return null;
  const devDist = join(
    appRoot,
    'node_modules',
    '.cache',
    app.cacheDirName,
    `dev-${resolution.pin.sha256}`,
  );
  const legacyRoot = join(devDist, LEGACY_APP_DIST_DIR);
  if (existsSync(join(legacyRoot, 'index.html'))) return legacyRoot;
  try {
    mkdirSync(devDist, { recursive: true });
    await bundleLegacyApp({
      app,
      appRoot,
      dist: devDist,
      pin: resolution.pin,
      env,
      log,
    });
    return legacyRoot;
  } catch (error) {
    log(
      `the dev server runs without ${app.label}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
};

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * The file `relativePath` (still percent-encoded) names inside `root`, or null
 * when it is not a file there. The route's own `..` check reads the encoded
 * path, so a decoded `..%2F` is caught here.
 */
const fileInside = (root: string, relativePath: string): string | null => {
  try {
    const path = resolve(root, decodeURIComponent(relativePath));
    if (!path.startsWith(`${root}${sep}`)) return null;
    return statSync(path, { throwIfNoEntry: false })?.isFile() ? path : null;
  } catch {
    return null;
  }
};

/**
 * Serve `legacyRoot` under /v8/ from the dev server. Registered ahead of
 * Vite's own middleware, so none of the older major's files is transformed and
 * a deep link under /v8/ gets the older major's shell, not this app's. With no
 * `legacyRoot` it does nothing.
 *
 * Its service worker is the one file it refuses. The older major registers it
 * even when framed, and once installed it would outlive the dev server and go
 * on answering /v8/ from its precache after the pin changes.
 */
export const createLegacyAppDevPlugin = (
  app: LegacyApp,
  legacyRoot: string | null,
): Plugin => ({
  name: `dev-legacy-${app.name}`,
  apply: 'serve',
  configureServer(server) {
    if (legacyRoot === null) return;
    server.middlewares.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const url = new URL(req.url ?? '/', 'http://dev.invalid');
      if (url.pathname === `/${LEGACY_APP_DIST_DIR}/sw.js`) {
        res.statusCode = 404;
        res.end();
        return;
      }
      const route = legacyAppPreviewRoute(
        url.pathname,
        (relativePath) => fileInside(legacyRoot, relativePath) !== null,
      );
      if (route === null) return next();
      if ('redirect' in route) {
        res.statusCode = 301;
        res.setHeader('Location', `${route.redirect}${url.search}`);
        res.end();
        return;
      }
      const pathname = 'rewrite' in route ? route.rewrite : url.pathname;
      const file = fileInside(
        legacyRoot,
        pathname.slice(`/${LEGACY_APP_DIST_DIR}/`.length),
      );
      if (file === null) return next();
      res.statusCode = 200;
      res.setHeader(
        'Content-Type',
        CONTENT_TYPES[extname(file).toLowerCase()] ??
          'application/octet-stream',
      );
      res.setHeader('Cache-Control', 'no-cache');
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(file).on('error', next).pipe(res);
    });
  },
});
