import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

import {
  appCachePrefix,
  resolveAppBasePath,
} from '../../../scripts/buildtime/app-base-path.mjs';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(appRoot, 'dist');

await build({ root: appRoot });

// A sub-path build is served from inside another deploy (Interviewer 8 at /v8/
// inside Interviewer 9's). Resolved the way vite.renderer.config.ts resolves
// it.
const base = resolveAppBasePath(process.env, 'INTERVIEWER_BASE_PATH');
if (base !== '/') {
  // Netlify reads _headers and _redirects only at the publish root, so nested
  // copies would be dead files served to anyone who asks; the hosting deploy
  // owns those rules.
  for (const file of ['_headers', '_redirects']) {
    rmSync(join(dist, file), { force: true });
  }

  // Interviewer has no build stamp of its own, so a sub-path dist describes
  // itself here: Interviewer 9's bundler checks the version, base and cache
  // prefix before it extracts one into dist/v8. The release packer
  // (scripts/release/package-app-subpath-dist.mjs) rewrites this file from the
  // tag it packs, which is the authority on tag and commit; a build replayed
  // from turbo's cache carries the commit that first produced it.
  const { version } = JSON.parse(
    readFileSync(join(appRoot, 'package.json'), 'utf8'),
  );
  writeFileSync(
    join(dist, 'dist-info.json'),
    `${JSON.stringify(
      {
        tag: `@codaco/interviewer@${version}`,
        version,
        commit: currentCommit(),
        base,
        cachePrefix: appCachePrefix('interviewer', base),
      },
      null,
      2,
    )}\n`,
  );
}

// The assertion reads the completed dist output, so load it only after Vite.
await import('./assert-pwa-build.mjs');

/**
 * The commit being built, or null outside a git checkout (a source tarball).
 *
 * @returns {string | null}
 */
function currentCommit() {
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^[0-9a-f]{40}$/.test(head) ? head : null;
  } catch {
    return null;
  }
}
