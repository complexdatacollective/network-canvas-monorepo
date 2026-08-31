#!/usr/bin/env node
// Post-build assertion: a production PWA build must emit the SW + manifest +
// icons, every emitted JS chunk, and every responsive stage-preview image must
// be precached. A missing critical asset breaks either the offline boot or the
// first offline rendering of screen thumbnails. Architect precaches all JS (no
// `globIgnores`), so any excluded chunk is a real regression. (Sibling of
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
const reclamationFile = `pwa-cache-reclamation-${precachePrefix}.js`;
if (!sw.includes(reclamationFile)) {
  fail('generated worker does not import its build-specific cache reclaimer');
}
let reclamationWorker;
try {
  reclamationWorker = readFileSync(path.join(dist, reclamationFile), 'utf8');
} catch {
  fail(`missing dist/${reclamationFile}`);
}
if (
  !reclamationWorker.includes(`const currentBuildId = "${precachePrefix}"`) ||
  !reclamationWorker.includes('includeUncontrolled: true') ||
  !reclamationWorker.includes('if (!leasedBuildIds) return;') ||
  !reclamationWorker.includes('data.type !== leaseResponseType') ||
  !reclamationWorker.includes('caches.delete(cacheName)')
) {
  fail(
    'cache reclaimer does not require complete build leases before deletion',
  );
}
if (
  [...reclamationWorker.matchAll(/self\.registration\.waiting/g)].length < 2 ||
  [...reclamationWorker.matchAll(/self\.registration\.installing/g)].length <
    2 ||
  [...reclamationWorker.matchAll(/readActiveBuild\(\)/g)].length < 2
) {
  fail('cache reclaimer does not recheck worker ownership and pending updates');
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
// entries; collect every precached critical-asset URL.
const precached = new Set(
  [...sw.matchAll(/["']([^"']+\.(?:js|webp))["']/g)].map((m) =>
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
const stagePreviewAssets = assetFiles
  .filter((f) => /\.4x3\.\d+-.*\.webp$/.test(f))
  .map((f) => `assets/${f}`);
if (stagePreviewAssets.length === 0) {
  fail('no 4:3 stage-preview assets found');
}

const missingStagePreviewAssets = stagePreviewAssets.filter(
  (url) => !precached.has(url),
);
if (missingStagePreviewAssets.length > 0) {
  fail(
    `stage-preview asset(s) excluded from precache: ${missingStagePreviewAssets.join(', ')}`,
  );
}

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

const assetHandoffRouteIndex = sw.indexOf(
  'pathname.startsWith("/assets/")',
  freshShellRoute.index,
);
const imageRouteIndex = sw.indexOf('cacheName:"architect-images"');
if (imageRouteIndex === -1 || imageRouteIndex < freshShellRoute.index) {
  fail('missing architect image-cache route after navigation routes');
}
if (assetHandoffRouteIndex === -1 || assetHandoffRouteIndex > imageRouteIndex) {
  fail('missing exact-hash asset handoff route after navigation routes');
}

const imageRouteEnd = sw.indexOf(
  'cacheName:"architect-fonts"',
  imageRouteIndex,
);
const imageRouteSource = sw.slice(
  Math.max(freshShellRoute.index, imageRouteIndex - 600),
  imageRouteEnd,
);
if (imageRouteEnd === -1 || !imageRouteSource.includes('&&![')) {
  fail('architect image-cache route does not exclude stable PWA icons');
}
for (const stableIconPath of [
  '/apple-touch-icon-180x180.png',
  '/pwa-64x64.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/maskable-icon-512x512.png',
  '/architect-icon.png',
]) {
  if (!imageRouteSource.includes(`"${stableIconPath}"`)) {
    fail(`architect image-cache route includes stable icon ${stableIconPath}`);
  }
}

const previewRoute = sw.slice(previewRouteIndex, freshShellRoute.index);
const freshShellRouteSource = sw.slice(
  freshShellRoute.index,
  assetHandoffRouteIndex,
);
const assetHandoffRouteSource = sw.slice(
  assetHandoffRouteIndex,
  imageRouteIndex,
);
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
if (
  /caches\.match|Reflect\.get\(globalThis,"caches"\)/.test(
    previewRoute + freshShellRouteSource,
  )
) {
  fail('navigation fallback searches retained precaches globally');
}
if (
  !/\/assets\//.test(assetHandoffRouteSource) ||
  !/js\|css/.test(assetHandoffRouteSource) ||
  !/caches\.match|Reflect\.get\(globalThis,"caches"\)/.test(
    assetHandoffRouteSource,
  ) ||
  !/fetch\(/.test(assetHandoffRouteSource)
) {
  fail('old-bundle JS/CSS cannot fall back to retained precaches');
}
if (/index\.html/.test(assetHandoffRouteSource)) {
  fail('exact-hash asset handoff must not search retained HTML shells');
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
  `PWA build ok: ${precachePrefix} retained independently; active-precache navigation fallbacks + exact-hash old-bundle handoff; no client claim; lease-gated old-precache cleanup; entry ${entry} + all ${jsAssets.length} JS chunks and ${stagePreviewAssets.length} stage-preview assets precached`,
);
