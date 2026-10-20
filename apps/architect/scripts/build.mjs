import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, loadEnv } from 'vite';

import { resolveArchitectBasePath } from './app-base-path.mjs';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await build({ root: appRoot });

// A sub-path build is served from inside another deploy (Architect 8 at /v8/
// inside Architect 9's). Netlify reads _headers and _redirects only at the
// publish root, so nested copies would be dead files served to anyone who
// asks; the hosting deploy owns those rules. Resolved the way vite.config.ts
// resolves it, so a base set in a .env file counts here too.
const base = resolveArchitectBasePath(loadEnv('production', appRoot, ''));
if (base !== '/') {
  await Promise.all(
    ['_headers', '_redirects'].map((file) =>
      rm(join(appRoot, 'dist', file), { force: true }),
    ),
  );
}

// The assertion reads the completed dist output, so load it only after Vite.
await import('./assert-pwa-build.mjs');
