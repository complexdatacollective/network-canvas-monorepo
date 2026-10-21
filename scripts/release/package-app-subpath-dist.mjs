#!/usr/bin/env node
// Packs a sub-path build of an app (ARCHITECT_BASE_PATH=/v8/,
// INTERVIEWER_BASE_PATH=/v8/) into the tarball the app's next major bundles:
// Architect 9 serves Architect 8, and Interviewer 9 serves Interviewer 8, at
// /v8/ from its own deploy, pinned by URL and sha256 in
// apps/<app>/legacy-<app>.json on the newer line. Run by
// .github/workflows/app-subpath-dist.yml from that workflow's own revision
// against a released tag's dist, so it reads everything from its arguments and
// nothing from the tag's tree.
//
// The tarball's root is the dist root (index.html, sw.js, assets/, …) plus
// dist-info.json, so the bundler extracts it straight into dist/v8. It is
// packed deterministically — sorted entries, a fixed mtime and owner, and a
// gzip header without a name or timestamp — so packing the same dist twice
// gives the same bytes. The build itself is not reproducible (its precache id
// is random outside turbo), which is why the workflow never replaces an
// uploaded tarball unless asked to.
//
// The shape checks repeat what the tag's own assert-pwa-build.mjs enforces on
// purpose: they run from reviewed tooling, after the build, against exactly
// what gets packed. A dist that would boot at the wrong path, or prune the
// hosting app's caches, fails here instead of reaching a pin.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import {
  appCachePrefix,
  resolveAppBasePath,
} from '../buildtime/app-base-path.mjs';

// The apps that ship an older major inside the next one. `htmlEntries` are
// the HTML documents the build emits, each of which must load its bundles
// from under the base.
export const SUBPATH_APPS = {
  architect: {
    label: 'Architect',
    baseVariable: 'ARCHITECT_BASE_PATH',
    htmlEntries: ['index.html', 'preview/index.html'],
  },
  interviewer: {
    label: 'Interviewer',
    baseVariable: 'INTERVIEWER_BASE_PATH',
    htmlEntries: ['index.html'],
  },
};

const ROOT_ASSET_REFERENCE = /(?:src|href)="\/assets\//;
const PRECACHE_PREFIX = /setCacheNameDetails\(\{prefix:"([^"]+)"\}\)/;

/**
 * @param {{ app: string, dist: string, tag: string, version: string, commit: string, base: string, out: string }} options
 * @returns {{ base: string, cachePrefix: string, sha256: string, out: string }}
 */
export function packageAppSubpathDist({
  app,
  dist,
  tag,
  version,
  commit,
  base: rawBase,
  out,
}) {
  const config = Object.hasOwn(SUBPATH_APPS, app)
    ? SUBPATH_APPS[app]
    : undefined;
  if (!config) {
    throw new Error(
      `'${app}' has no sub-path dist. Expected one of: ${Object.keys(SUBPATH_APPS).join(', ')}.`,
    );
  }
  const { label, baseVariable, htmlEntries } = config;
  const base = resolveAppBasePath({ [baseVariable]: rawBase }, baseVariable);
  if (base === '/') {
    throw new Error(
      'The sub-path dist needs a base such as /v8/; a root build is deployed, not bundled.',
    );
  }
  if (tag !== `@codaco/${app}@${version}`) {
    throw new Error(`${tag} is not the release tag of ${label} ${version}.`);
  }
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(`commit must be a full SHA, got '${commit}'.`);
  }
  const cachePrefix = appCachePrefix(app, base);

  const read = (file) => {
    const path = join(dist, file);
    if (!existsSync(path)) throw new Error(`dist is missing ${file}.`);
    return readFileSync(path, 'utf8');
  };

  for (const file of htmlEntries) {
    const html = read(file);
    if (!html.includes(`${base}assets/`)) {
      throw new Error(`${file} does not load its assets from ${base}assets/.`);
    }
    if (ROOT_ASSET_REFERENCE.test(html)) {
      throw new Error(
        `${file} still loads assets from /assets/, outside ${base}.`,
      );
    }
  }

  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const field of ['start_url', 'scope']) {
    if (manifest[field] !== base) {
      throw new Error(
        `manifest.webmanifest ${field} is ${JSON.stringify(manifest[field])}, not ${base}.`,
      );
    }
  }

  // The hosting app's worker reclaims every precache under its own prefix
  // except the ones it is told belong to this build, so a worker under any
  // other prefix would have its caches deleted, or delete the host's.
  const precachePrefix = read('sw.js').match(PRECACHE_PREFIX)?.[1];
  if (!precachePrefix?.startsWith(`${cachePrefix}${version}-`)) {
    throw new Error(
      `sw.js precaches under ${JSON.stringify(precachePrefix ?? null)}, not ${cachePrefix}${version}-….`,
    );
  }

  const maps = listFiles(dist).filter((file) => file.endsWith('.map'));
  if (maps.length > 0) {
    throw new Error(
      `dist carries source maps, which would be served publicly: ${maps.join(', ')}`,
    );
  }

  // Netlify reads these only at the publish root, so nested copies would be
  // dead files anyone could fetch; the hosting deploy owns the /v8/ rules.
  for (const file of ['_headers', '_redirects']) {
    rmSync(join(dist, file), { force: true });
  }

  // Written here even when the build stamped one (Interviewer's does): this
  // run knows the released tag and commit, which a build replayed from a
  // cache or made outside a checkout may not.
  writeFileSync(
    join(dist, 'dist-info.json'),
    `${JSON.stringify({ tag, version, commit, base, cachePrefix }, null, 2)}\n`,
  );

  const packed = spawnSync(
    'bash',
    [
      '-c',
      'set -euo pipefail; tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -C "$1" -cf - . | gzip -n > "$2"',
      'pack',
      dist,
      out,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (packed.status !== 0) {
    throw new Error(`packing ${dist} failed (GNU tar is required).`);
  }

  const sha256 = createHash('sha256').update(readFileSync(out)).digest('hex');
  // sha256sum's own format, so `sha256sum -c` verifies it.
  writeFileSync(`${out}.sha256`, `${sha256}  ${basename(out)}\n`);
  return { base, cachePrefix, sha256, out };
}

function listFiles(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)));
}

function main() {
  const { values } = parseArgs({
    options: {
      app: { type: 'string' },
      dist: { type: 'string' },
      tag: { type: 'string' },
      version: { type: 'string' },
      commit: { type: 'string' },
      base: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const { app, dist, tag, version, commit, base, out } = values;
  if (!app || !dist || !tag || !version || !commit || !base || !out) {
    console.error(
      'Usage: node scripts/release/package-app-subpath-dist.mjs --app <architect|interviewer> --dist <dir> --tag <tag> --version <version> --commit <sha> --base </vN/> --out <file.tgz>',
    );
    process.exit(1);
  }
  try {
    const result = packageAppSubpathDist({
      app,
      dist,
      tag,
      version,
      commit,
      base,
      out,
    });
    if (process.env.GITHUB_OUTPUT) {
      writeFileSync(
        process.env.GITHUB_OUTPUT,
        `sha256=${result.sha256}\ncache_prefix=${result.cachePrefix}\n`,
        { flag: 'a' },
      );
    }
    console.log(
      `[subpath-dist] ${tag} under ${result.base} -> ${out} (sha256 ${result.sha256})`,
    );
  } catch (error) {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
