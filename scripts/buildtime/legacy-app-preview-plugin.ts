// `vite preview` applies no _redirects, so its SPA fallback would answer a
// /v8/ deep link with the newer app's shell. This plugin serves the older
// major's files from dist/v8 instead, the way Netlify does with the app's
// public/_redirects, whenever a build (or an e2e setup) has put an index.html
// there. With no dist/v8 it does nothing.
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Plugin } from 'vite';

import {
  LEGACY_APP_DIST_DIR,
  type LegacyApp,
  legacyAppPreviewRoute,
} from './legacy-app.ts';

export const createLegacyAppPreviewPlugin = (app: LegacyApp): Plugin => ({
  name: `preview-legacy-${app.name}`,
  configurePreviewServer(server) {
    const legacyRoot = resolve(
      server.config.root,
      server.config.build.outDir,
      LEGACY_APP_DIST_DIR,
    );
    server.middlewares.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (!statSync(join(legacyRoot, 'index.html'), { throwIfNoEntry: false }))
        return next();
      const url = new URL(req.url ?? '/', 'http://preview.invalid');
      const route = legacyAppPreviewRoute(url.pathname, (relativePath) => {
        try {
          return (
            statSync(join(legacyRoot, decodeURIComponent(relativePath)), {
              throwIfNoEntry: false,
            })?.isFile() ?? false
          );
        } catch {
          return false;
        }
      });
      if (route === null || 'serve' in route) return next();
      if ('redirect' in route) {
        res.statusCode = 301;
        res.setHeader('Location', `${route.redirect}${url.search}`);
        res.end();
        return;
      }
      req.url = `${route.rewrite}${url.search}`;
      next();
    });
  },
});
