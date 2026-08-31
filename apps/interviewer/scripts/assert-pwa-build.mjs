#!/usr/bin/env node
// Post-build assertion: a production PWA build must emit the SW + manifest +
// icons, and every critical chunk (the interview engine, the entry) must be
// precached — a chunk over the precache limit silently drops from the SW
// manifest and breaks the offline boot.
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
    additionalStablePaths: ['/interviewer-icon.png'],
    text: readFileSync(path.join(dist, '_headers'), 'utf8'),
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const swPath = path.join(dist, 'sw.js');
let sw;
try {
  sw = readFileSync(swPath, 'utf8');
} catch {
  fail('missing dist/sw.js');
}

const packageJson = JSON.parse(
  readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
);
const expectedPrecachePrefixStart = `interviewer-${packageJson.version}-`;
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

// generateSW inlines the precache manifest as `self.__WB_MANIFEST` replaced with
// an array literal of { url, revision } entries. Every emitted .js asset chunk
// must appear there — if workbox skipped one for size, it won't.
const precached = new Set(
  [...sw.matchAll(/["']([^"']+\.js)["']/g)].map((m) =>
    m[1].replace(/^\/+/, ''),
  ),
);

const assetsDir = path.join(dist, 'assets');
let assetFiles = [];
try {
  assetFiles = await readdir(assetsDir);
} catch {
  fail('missing dist/assets');
}
const jsAssets = assetFiles.filter((f) => f.endsWith('.js'));

// Source maps are emitted only to be uploaded to PostHog, and the upload
// deletes them (see vite.config.ts). One surviving here would publish the
// app's full source with the deploy.
const strayMaps = (await readdir(dist, { recursive: true })).filter((f) =>
  f.endsWith('.map'),
);
if (strayMaps.length > 0) {
  fail(`source map(s) left in dist: ${strayMaps.join(', ')}`);
}

const critical = jsAssets.filter(
  (f) =>
    f.startsWith('interview-engine') ||
    f.startsWith('main') ||
    f.startsWith('index') ||
    // The export Web Worker chunk: offline data export depends on it.
    f.startsWith('exportWorker'),
);
if (critical.length === 0) {
  fail('no critical chunks (interview-engine / entry) found');
}

const excluded = critical.filter((f) => !precached.has(`assets/${f}`));
if (excluded.length > 0) {
  fail(`critical chunk(s) excluded from precache: ${excluded.join(', ')}`);
}

const interviewRouteMatches = [
  ...sw.matchAll(/!?[$\w]+\.pathname\.startsWith\("\/interview\/"\)/g),
];
const interviewCacheRoute = interviewRouteMatches.find(
  (match) => !match[0].startsWith('!'),
);
const freshShellRoute = interviewRouteMatches.find((match) =>
  match[0].startsWith('!'),
);
if (!interviewCacheRoute) {
  fail('missing /interview/ precached-shell navigation route');
}
if (!freshShellRoute) {
  fail('fresh-shell navigation route does not exclude /interview/');
}
if (
  interviewCacheRoute.index === undefined ||
  freshShellRoute.index === undefined ||
  interviewCacheRoute.index > freshShellRoute.index
) {
  fail('/interview/ navigation route must run before fresh-shell route');
}

const interviewFallbackIndex = sw.indexOf(
  '.PrecacheFallbackPlugin({fallbackURL:"index.html"})',
  interviewCacheRoute.index,
);
if (
  interviewFallbackIndex === -1 ||
  interviewFallbackIndex > freshShellRoute.index
) {
  fail('/interview/ navigation route must fall back to precached index.html');
}

const interviewRoute = sw.slice(
  interviewCacheRoute.index,
  freshShellRoute.index,
);
const imagesRouteIndex = sw.indexOf(
  'cacheName:"interviewer-images"',
  freshShellRoute.index,
);
if (imagesRouteIndex === -1) {
  fail('missing interviewer image-cache route after navigation routes');
}
const freshShellRouteSource = sw.slice(freshShellRoute.index, imagesRouteIndex);
if (!/\.CacheOnly\(\{/.test(interviewRoute)) {
  fail('/interview/ navigation does not force the active cached shell');
}
if (
  !interviewRoute.includes(`cacheName:"${precachePrefix}-interview-navigation"`)
) {
  fail('/interview/ cache-only route is not isolated to this build');
}
if (!/\.NetworkOnly\(\{plugins:\[/.test(freshShellRouteSource)) {
  fail('fresh navigation does not use the non-caching network strategy');
}
if (
  !/new AbortController/.test(freshShellRouteSource) ||
  !/3e3/.test(freshShellRouteSource)
) {
  fail('fresh navigation lost its three-second offline bound');
}
if (
  !/fetchDidSucceed/.test(freshShellRouteSource) ||
  !/fetchDidFail/.test(freshShellRouteSource) ||
  !/clearTimeout/.test(freshShellRouteSource)
) {
  fail('fresh navigation does not clear its completed request timeout');
}
if (
  !/\.PrecacheFallbackPlugin\(\{fallbackURL:"index\.html"\}\)/.test(
    freshShellRouteSource,
  )
) {
  fail('fresh navigation does not use the active worker precache');
}
if (/\.NetworkFirst\(/.test(interviewRoute + freshShellRouteSource)) {
  fail('navigation runtime-caches HTML from a different app bundle');
}

console.log(
  `PWA build ok: ${precachePrefix} retained independently; active-precache navigation fallbacks; no client claim/old-precache cleanup; ${critical.length} critical chunk(s) precached`,
);
