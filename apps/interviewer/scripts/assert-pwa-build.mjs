#!/usr/bin/env node
// Post-build assertion: a production PWA build must emit the SW + manifest +
// icons, and every critical chunk (the interview engine, the entry) and every
// lazily loaded locale chunk must be precached. A missing critical asset breaks
// either the offline boot or an offline language switch. No stage-preview
// image may be in the build: the stage menu draws stage-type icons, and an
// image something started importing again would not be precached.
// Chunks loaded on demand (each UI language, the bundled sample protocol, the
// synthetic data generator and its faker dependency) must stay out of the
// initial load. The Development protocol, offered only in `vite dev`, must not
// be in the build at all.
import { readdirSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from 'vite';

import { assertNoDevelopmentProtocol } from '../../../scripts/buildtime/assert-no-development-protocol.mjs';
import { assertPwaCacheHeaders } from '../../../scripts/buildtime/assert-pwa-cache-headers.mjs';
import {
  assertAnchoredRoute,
  assertLegacyAppOutput,
  assertLegacyRedirects,
  assertLegacyRouteExclusions,
  assertLegacySameOriginFraming,
  findLegacyPrecacheEntries,
  routeMatcherAt,
} from '../../../scripts/buildtime/legacy-app-assertions.ts';
import {
  legacyApp,
  loadLegacyAppV8,
} from '../../../scripts/buildtime/legacy-app.ts';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const dist = path.join(appRoot, 'dist');

const fail = (msg) => {
  console.error(`PWA build assertion failed: ${msg}`);
  process.exit(1);
};

// Interviewer 8 is served at /v8/ from this deploy (dist/v8, see
// scripts/buildtime/legacy-app.ts), so its stable entry points and hashed
// assets are held to the same contract as this app's, whether or not this
// build bundles it, and its deep links must reach its own shell. This app
// hosts its interview in a same-origin frame, so /v8/ may be framed by this
// origin and no other.
const legacyInterviewer = legacyApp('interviewer');
try {
  const headers = readFileSync(path.join(dist, '_headers'), 'utf8');
  assertPwaCacheHeaders({
    additionalStablePaths: ['/interviewer-icon.png'],
    nestedBases: ['/v8/'],
    text: headers,
  });
  assertLegacySameOriginFraming(headers);
  assertLegacyRedirects(
    legacyInterviewer,
    readFileSync(path.join(dist, '_redirects'), 'utf8'),
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

// The Development protocol is installable only in `vite dev` (Home.tsx and
// useProtocolImport.ts), so none of it — its JSON or its media, a 23MB video
// among them — belongs in a production build, not even as a chunk nothing
// fetches: everything in dist is deployed.
try {
  assertNoDevelopmentProtocol(dist);
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
// This build shares its origin with Interviewer 8 at /v8/, whose
// 'interviewer-v8-' caches also start with 'interviewer-'. Its reclaimer must
// leave those caches and /v8/ windows alone.
const expectedForeignCachePrefixes = [legacyInterviewer.cachePrefix];
if (
  !reclamationWorker.includes(
    `const foreignCachePrefixes = ${JSON.stringify(expectedForeignCachePrefixes)};`,
  ) ||
  !reclamationWorker.includes(
    `const foreignScopePaths = ${JSON.stringify(['/v8/'])};`,
  ) ||
  !reclamationWorker.includes('!isForeignCacheName(cacheName)') ||
  !reclamationWorker.includes('!isForeignScopePath(clientUrl.pathname)')
) {
  fail(
    'cache reclaimer does not leave the nested Interviewer 8 caches and windows alone',
  );
}
const legacyPrecacheEntries = findLegacyPrecacheEntries(sw);
if (legacyPrecacheEntries.length > 0) {
  fail(
    `Interviewer 8 is in this app's precache: ${legacyPrecacheEntries.join(', ')}`,
  );
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
// an array literal of { url, revision } entries. Every critical asset must
// appear there — if Workbox skipped one or the glob omitted it, it won't.
const precached = new Set(
  [...sw.matchAll(/["']([^"']+\.(?:js|webp))["']/g)].map((m) =>
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
const stagePreviewAssets = assetFiles.filter((f) =>
  /\.4x3\.\d+-.*\.webp$/.test(f),
);

if (stagePreviewAssets.length > 0) {
  fail(
    `stage-preview image(s) in the build, which nothing precaches: ${stagePreviewAssets.join(', ')}`,
  );
}

// Fonts are left to the runtime cache. The hashed header mark (Home's and
// onboarding's) is precached: the installing page is not controlled by the
// worker, so the runtime cache never sees it before the first offline launch.
const fontAssets = assetFiles
  .filter((f) => f.endsWith('.woff2'))
  .map((f) => `assets/${f}`);
if (fontAssets.length === 0) {
  fail('no .woff2 fonts emitted to dist/assets');
}
const headerMarks = assetFiles.filter((f) => /^NC-Flat-.+\.png$/.test(f));
if (headerMarks.length === 0) {
  fail('no hashed header mark (assets/NC-Flat-*.png) emitted');
}

const manifestUrls = new Set(
  [...sw.matchAll(/\{url:"([^"]+)",revision:/g)].map((m) => m[1]),
);
const precachedFonts = fontAssets.filter((url) => manifestUrls.has(url));
if (precachedFonts.length > 0) {
  fail(
    `the build precaches runtime-cached fonts: ${precachedFonts.join(', ')}`,
  );
}
const missingMarks = headerMarks
  .map((f) => `assets/${f}`)
  .filter((url) => !manifestUrls.has(url));
if (missingMarks.length > 0) {
  fail(
    `the header mark is not precached, so it breaks on the first offline launch: ${missingMarks.join(', ')}`,
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

// dist/v8 holds exactly the pinned Interviewer 8 (or nothing), under the
// cache prefix the reclaimer was checked above to leave alone. The recursive
// source-map check above covers it too.
const legacyInterviewerV8 = loadLegacyAppV8(
  legacyInterviewer,
  appRoot,
  loadEnv('production', appRoot, ''),
);
try {
  assertLegacyAppOutput({
    app: legacyInterviewer,
    dist,
    resolution: legacyInterviewerV8,
    foreignCachePrefixes: expectedForeignCachePrefixes,
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
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

// The initial load: the scripts index.html loads or preloads, plus every chunk
// they import statically. Dynamic `import()` targets are not followed.
const indexHtml = readFileSync(path.join(dist, 'index.html'), 'utf8');
const initialLoad = new Set(
  [
    ...indexHtml.matchAll(
      /<(?:script[^>]*\bsrc|link[^>]*\bhref)="\/assets\/([^"]+\.js)"/g,
    ),
  ].map((m) => m[1]),
);
for (const chunk of initialLoad) {
  const source = readFileSync(path.join(assetsDir, chunk), 'utf8');
  for (const m of source.matchAll(
    /\b(?:import|export)\s*(?:[\w$*{}\s,]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g,
  )) {
    initialLoad.add(m[1]);
  }
}
// The entry imports the interview engine statically, so a walk that misses it
// has stopped matching the HTML or the import syntax, and the check below
// would pass vacuously.
const initialLoadChunks = [...initialLoad];
if (
  !initialLoadChunks.some((f) => f.startsWith('main-')) ||
  !initialLoadChunks.some((f) => f.startsWith('interview-engine-'))
) {
  fail(
    `could not resolve the initial-load chunks (found: ${initialLoadChunks.join(', ') || 'none'})`,
  );
}

// Modules the app loads on demand to keep them out of the initial load. Each
// must stay its own chunk (a static import anywhere folds it into the entry,
// and the chunk disappears) outside the initial load, and must be precached
// exactly when the feature it serves has to work offline.
const deferredChunks = [
  {
    prefix: 'bundledSampleProtocol-',
    purpose: 'installing the sample protocol',
    precache: true,
  },
  {
    prefix: 'generate-',
    purpose: 'generating synthetic interviews',
    precache: true,
  },
];
for (const { prefix, purpose, precache } of deferredChunks) {
  const matches = jsAssets.filter((f) => f.startsWith(prefix));
  if (matches.length !== 1) {
    fail(
      `expected one on-demand ${prefix}*.js chunk for ${purpose}, found ${matches.length}`,
    );
  }
  const [chunk] = matches;
  if (initialLoad.has(chunk)) {
    fail(`${chunk} (${purpose}) is part of the initial load`);
  }
  if (precached.has(`assets/${chunk}`) !== precache) {
    fail(
      precache
        ? `${chunk} is excluded from precache, so ${purpose} fails offline`
        : `${chunk} is precached, so every install downloads it`,
    );
  }
}

// Faker should reach the bundle only through the synthetic generator chunk.
// Its core module carries this deprecation-warning prefix. Finding it in the
// initial load means something imports the generator statically, or that
// @codaco/protocol-utilities lost `"sideEffects": false` (a module-level
// invariant in its ValueGenerator.ts otherwise keeps faker alive). Not finding
// it anywhere means Faker reworded the message and the marker needs updating.
const FAKER_MARKER = '[@faker-js/faker]: ';
const fakerChunks = jsAssets.filter((f) =>
  readFileSync(path.join(assetsDir, f), 'utf8').includes(FAKER_MARKER),
);
if (fakerChunks.length === 0) {
  fail(`no chunk contains the faker marker ${FAKER_MARKER}; update it`);
}
const fakerInInitialLoad = fakerChunks.filter((f) => initialLoad.has(f));
if (fakerInInitialLoad.length > 0) {
  fail(
    `@faker-js/faker is part of the initial load (${fakerInInitialLoad.join(', ')})`,
  );
}

// Each UI language's messages are a chunk of their own, loaded only when a
// device shows that language (vite.config.ts names them). Three things have to
// hold for that to work offline and to stay lazy:
//
// - Every committed catalog has a chunk. A missing group means the catalogs
//   lost their naming and scattered into anonymous chunks this check cannot
//   see, or fell back into a static chunk every device downloads in full.
// - Every one is precached. Switching language offline loads a chunk the
//   device may never have fetched, and only the precache can supply it.
// - None is imported statically, by the HTML or by another chunk. A named
//   chunk proves only where the catalog went, not how it is loaded; a static
//   import would fetch every language on every launch.
const catalogTags = (localesDir) =>
  readdirSync(localesDir)
    .map((f) => /^([A-Za-z-]+)\.json$/.exec(f)?.[1])
    .filter((tag) => tag !== undefined && tag !== 'en');
const localeGroups = [
  { prefix: 'locale-', dir: path.join(appRoot, 'src/locales') },
  {
    prefix: 'interview-locale-',
    dir: path.join(appRoot, '../../packages/interview/src/locales'),
  },
];
const localeChunks = jsAssets.filter((f) =>
  localeGroups.some(({ prefix }) => f.startsWith(prefix)),
);
const missingLocaleChunks = localeGroups.flatMap(({ prefix, dir }) =>
  catalogTags(dir)
    .map((tag) => `${prefix}${tag}`)
    .filter((name) => !localeChunks.some((f) => f.startsWith(`${name}-`))),
);
if (missingLocaleChunks.length > 0) {
  fail(`no chunk for locale catalog(s): ${missingLocaleChunks.join(', ')}`);
}
const unprecachedLocaleChunks = localeChunks.filter(
  (f) => !precached.has(`assets/${f}`),
);
if (unprecachedLocaleChunks.length > 0) {
  fail(
    `locale chunk(s) excluded from precache, so offline language switching cannot load them: ${unprecachedLocaleChunks.join(', ')}`,
  );
}
// `from"./x.js"` and `import"./x.js"` are static; a dynamic import is
// `import(` and never matches.
const staticLocaleImport =
  /(?:\bfrom|\bimport)\s*["'`]\.\/(?:interview-)?locale-[^"'`]+["'`]/;
const staticLocaleImporters = [
  ...(/["'`/](?:interview-)?locale-[^"'`/]+\.js["'`]/.test(indexHtml)
    ? ['index.html']
    : []),
  ...jsAssets.filter((f) =>
    staticLocaleImport.test(readFileSync(path.join(assetsDir, f), 'utf8')),
  ),
];
if (staticLocaleImporters.length > 0) {
  fail(
    `locale chunk(s) loaded statically, so every launch downloads every language: ${staticLocaleImporters.join(', ')}`,
  );
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
const assetHandoffRouteIndex = sw.indexOf(
  'pathname.startsWith("/assets/")',
  freshShellRoute.index,
);
const imagesRouteIndex = sw.indexOf(
  'cacheName:"interviewer-images"',
  freshShellRoute.index,
);
if (imagesRouteIndex === -1) {
  fail('missing interviewer image-cache route after navigation routes');
}
if (
  assetHandoffRouteIndex === -1 ||
  assetHandoffRouteIndex > imagesRouteIndex
) {
  fail('missing exact-hash asset handoff route after navigation routes');
}
const imagesRouteEnd = sw.indexOf(
  'cacheName:"interviewer-fonts"',
  imagesRouteIndex,
);
const imagesRouteSource = sw.slice(
  Math.max(freshShellRoute.index, imagesRouteIndex - 600),
  imagesRouteEnd,
);
if (imagesRouteEnd === -1 || !imagesRouteSource.includes('&&![')) {
  fail('interviewer image-cache route does not exclude stable PWA icons');
}
for (const stableIconPath of [
  '/apple-touch-icon-180x180.png',
  '/pwa-64x64.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/maskable-icon-512x512.png',
  '/interviewer-icon.png',
]) {
  if (!imagesRouteSource.includes(`"${stableIconPath}"`)) {
    fail(
      `interviewer image-cache route includes stable icon ${stableIconPath}`,
    );
  }
}
// Interviewer 8 at /v8/ has its own worker: nothing of it may be answered or
// cached here. The navigation and asset routes that match only /interview/
// and /assets/ cannot see it; the rest exclude it by name.
try {
  assertLegacyRouteExclusions({
    app: legacyInterviewer,
    freshShell: routeMatcherAt(sw, freshShellRoute.index),
    image: routeMatcherAt(sw, imagesRouteIndex),
    font: routeMatcherAt(sw, imagesRouteEnd),
    sameOriginRoutes: ['image', 'font'],
  });
  assertAnchoredRoute({
    description: 'the /interview/ precached-shell navigation route',
    source: routeMatcherAt(sw, interviewCacheRoute.index),
    prefix: '/interview/',
  });
  assertAnchoredRoute({
    description: 'the exact-hash asset handoff route',
    source: routeMatcherAt(sw, assetHandoffRouteIndex),
    prefix: '/assets/',
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const freshShellRouteSource = sw.slice(
  freshShellRoute.index,
  assetHandoffRouteIndex,
);
const assetHandoffRouteSource = sw.slice(
  assetHandoffRouteIndex,
  imagesRouteIndex,
);
if (!/\.CacheOnly\(\{/.test(interviewRoute)) {
  fail('/interview/ navigation does not force the active cached shell');
}
if (!interviewRoute.includes('cacheName:"interviewer-interview-navigation"')) {
  fail('/interview/ cache-only route does not use its shared empty cache');
}
if (interviewRoute.includes(`${precachePrefix}-interview-navigation`)) {
  fail('/interview/ empty cache must not accumulate per build');
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
if (
  /caches\.match|Reflect\.get\(globalThis,"caches"\)/.test(
    interviewRoute + freshShellRouteSource,
  )
) {
  fail('navigation fallback searches retained precaches globally');
}
if (
  !/\/assets\//.test(assetHandoffRouteSource) ||
  !/js\|css/.test(assetHandoffRouteSource) ||
  !/4x3/.test(assetHandoffRouteSource) ||
  !/webp/.test(assetHandoffRouteSource) ||
  !/caches\.match|Reflect\.get\(globalThis,"caches"\)/.test(
    assetHandoffRouteSource,
  ) ||
  !/fetch\(/.test(assetHandoffRouteSource)
) {
  fail(
    'old-bundle JS/CSS and stage-preview WebPs cannot fall back to retained precaches',
  );
}
if (/index\.html/.test(assetHandoffRouteSource)) {
  fail('exact-hash asset handoff must not search retained HTML shells');
}

console.log(
  `PWA build ok: ${precachePrefix} retained independently; no Development protocol; ${legacyInterviewerV8.bundled ? `Interviewer ${legacyInterviewerV8.pin.version} bundled at /v8/ outside the precache` : `no Interviewer 8 bundled (${legacyInterviewerV8.reason})`}, /v8/ left to its own worker; active-precache navigation fallbacks + exact-hash old-bundle JS/CSS and stage-preview handoff; no client claim; lease-gated old-precache cleanup; ${critical.length} critical chunk(s), ${localeChunks.length} lazily loaded locale chunk(s) precached; ${deferredChunks.length} on-demand chunk(s) and faker outside the ${initialLoad.size}-chunk initial load`,
);
