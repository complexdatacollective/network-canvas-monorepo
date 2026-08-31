#!/usr/bin/env node
// Post-build assertion: a production PWA build must emit the SW + manifest +
// icons, and every emitted JS chunk must be precached. A chunk over the workbox
// `maximumFileSizeToCacheInBytes` limit silently drops from the SW precache
// manifest and 404s offline, breaking the offline boot. Architect precaches all
// JS (no `globIgnores`), so any excluded chunk is a real regression. (Sibling of
// apps/interviewer/scripts/assert-pwa-build.mjs, which instead checks named
// critical chunks because it intentionally excludes its dev-protocol chunk.)
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPwaCacheHeaders } from '../../../scripts/assert-pwa-cache-headers.mjs';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const dist = path.join(appRoot, 'dist');

const fail = (msg) => {
  console.error(`PWA build assertion failed: ${msg}`);
  process.exit(1);
};

try {
  assertPwaCacheHeaders({
    additionalStablePaths: [
      '/preview/',
      '/preview/index.html',
      '/architect-icon.png',
    ],
    text: readFileSync(path.join(dist, '_headers'), 'utf8'),
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

let sw;
try {
  sw = readFileSync(path.join(dist, 'sw.js'), 'utf8');
} catch {
  fail('missing dist/sw.js');
}

const packageJson = JSON.parse(
  readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
);
const expectedPrecachePrefixStart = `architect-${packageJson.version}-`;
const precachePrefix = sw.match(
  /setCacheNameDetails\(\{prefix:"([^"]+)"\}\)/,
)?.[1];
const buildId = precachePrefix?.slice(expectedPrecachePrefixStart.length);
const isTurboBuildId = /^turbo-[a-f\d]{16}$/.test(buildId ?? '');
const isDirectBuildId =
  /^direct-[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(
    buildId ?? '',
  );
if (
  !precachePrefix?.startsWith(expectedPrecachePrefixStart) ||
  (!isTurboBuildId && !isDirectBuildId)
) {
  fail(
    `precache is not isolated to app version ${packageJson.version} and its build artifact`,
  );
}
if (/\.clientsClaim\(\)/.test(sw)) {
  fail('generated worker claims clients loaded by an older app bundle');
}
if (/\.cleanupOutdatedCaches\(\)/.test(sw)) {
  fail('generated worker deletes precaches still needed by older clients');
}
if (/Reflect\.get\(globalThis,"caches"\)/.test(sw)) {
  fail('navigation fallback searches retained precaches globally');
}

for (const f of [
  'manifest.webmanifest',
  'pwa-192x192.png',
  'pwa-512x512.png',
]) {
  try {
    readFileSync(path.join(dist, f));
  } catch {
    fail(`missing dist/${f}`);
  }
}

// generateSW inlines the precache manifest as an array of { url, revision }
// entries; collect every precached .js url.
const precached = new Set(
  [...sw.matchAll(/["']([^"']+\.js)["']/g)].map((m) =>
    m[1].replace(/^\/+/, ''),
  ),
);

let assetFiles = [];
try {
  assetFiles = await readdir(path.join(dist, 'assets'));
} catch {
  fail('missing dist/assets');
}
const jsAssets = assetFiles
  .filter((f) => f.endsWith('.js'))
  .map((f) => `assets/${f}`);
if (jsAssets.length === 0) fail('no JS chunks emitted to dist/assets');

// Source maps are emitted only to be uploaded to PostHog, and the upload
// deletes them (see vite.config.ts). One surviving here would publish the
// app's full source with the deploy.
const strayMaps = (await readdir(dist, { recursive: true })).filter((f) =>
  f.endsWith('.map'),
);
if (strayMaps.length > 0) {
  fail(`source map(s) left in dist: ${strayMaps.join(', ')}`);
}

// The entry module (referenced by index.html) boots the app; it must be
// precached for an offline start. Derive it rather than hardcode the hash.
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
if (
  !html.includes('script-src &#39;self&#39; https://ph-relay.networkcanvas.com')
) {
  fail('PostHog relay missing from the script-src CSP directive');
}
const entry = (html.match(/assets\/[^"']+\.js/) || [])[0];
if (!entry) fail('no entry chunk referenced in dist/index.html');
if (!precached.has(entry)) fail(`entry chunk excluded from precache: ${entry}`);

if (!/url:"preview\/index\.html"/.test(sw)) {
  fail('preview/index.html missing from precache manifest');
}

const previewRouteIndex = sw.indexOf('pathname.startsWith("/preview/")');
const freshShellMatcher = /![$\w]+\.pathname\.startsWith\("\/preview\/"\)/g;
freshShellMatcher.lastIndex = Math.max(previewRouteIndex, 0);
const freshShellRoute = freshShellMatcher.exec(sw);
if (previewRouteIndex === -1 || freshShellRoute?.index === undefined) {
  fail('missing preview/fresh-shell navigation routes');
}

const imageRouteIndex = sw.indexOf('cacheName:"architect-images"');
if (imageRouteIndex === -1 || imageRouteIndex < freshShellRoute.index) {
  fail('missing architect image-cache route after navigation routes');
}

const previewRoute = sw.slice(previewRouteIndex, freshShellRoute.index);
const freshShellRouteSource = sw.slice(freshShellRoute.index, imageRouteIndex);
const assertCurrentPrecacheFallback = (route, fallbackURL, name) => {
  if (!/\.NetworkOnly\(\{plugins:\[/.test(route)) {
    fail(`${name} navigation does not use the non-caching network strategy`);
  }
  if (!/new AbortController/.test(route) || !/3e3/.test(route)) {
    fail(`${name} navigation lost its three-second offline bound`);
  }
  if (
    !/fetchDidSucceed/.test(route) ||
    !/fetchDidFail/.test(route) ||
    !/clearTimeout/.test(route)
  ) {
    fail(`${name} navigation does not clear its completed request timeout`);
  }
  const fallbackPattern = new RegExp(
    `\\.PrecacheFallbackPlugin\\(\\{fallbackURL:"${fallbackURL.replaceAll('.', '\\.')}"\\}\\)`,
  );
  if (!fallbackPattern.test(route)) {
    fail(`${name} navigation does not use the active worker's precache`);
  }
};

assertCurrentPrecacheFallback(previewRoute, 'preview/index.html', 'preview');
assertCurrentPrecacheFallback(
  freshShellRouteSource,
  'index.html',
  'fresh-shell',
);
if (/\.NetworkFirst\(/.test(previewRoute + freshShellRouteSource)) {
  fail('navigation runtime-caches HTML from a different app bundle');
}

// No globIgnores means every emitted chunk should be precached; an excluded one
// exceeded the size limit and would 404 offline.
const excluded = jsAssets.filter((u) => !precached.has(u));
if (excluded.length > 0) {
  fail(
    `JS chunk(s) excluded from precache (over the size limit?): ${excluded.join(', ')}`,
  );
}

console.log(
  `PWA build ok: ${precachePrefix} retained independently; active-precache navigation fallbacks; no client claim/old-precache cleanup; entry ${entry} + all ${jsAssets.length} JS chunks precached`,
);
