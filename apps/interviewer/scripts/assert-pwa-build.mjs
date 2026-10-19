#!/usr/bin/env node
// Post-build assertion: a production PWA build must emit the SW + manifest +
// icons, every critical chunk (the interview engine, the entry), every
// lazily loaded locale chunk, and every responsive stage-preview image must be
// precached. A missing critical asset breaks either the offline boot, an
// offline language switch, or the first offline opening of the menu.
// Chunks loaded on demand (each UI language, the bundled sample protocol, the
// synthetic data generator and its faker dependency) must stay out of the
// initial load.
//
// Base-aware: INTERVIEWER_BASE_PATH (resolved exactly as vite.renderer.config.ts
// resolves it) selects the root build or the /v8/ build Interviewer 9 serves
// from its own deploy, and every path and cache name probed below derives
// from it, so a sub-path build is held to the same worker contract.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  appCachePrefix,
  resolveAppBasePath,
} from '../../../scripts/buildtime/app-base-path.mjs';
import { assertPwaCacheHeaders } from '../../../scripts/buildtime/assert-pwa-cache-headers.mjs';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const dist = path.join(appRoot, 'dist');

const fail = (msg) => {
  console.error(`PWA build assertion failed: ${msg}`);
  process.exit(1);
};

// `/` for the root build; `/v8/` for Interviewer 8 inside Interviewer 9's
// deploy.
const base = resolveAppBasePath(process.env, 'INTERVIEWER_BASE_PATH');
const isSubpath = base !== '/';
const cachePrefix = appCachePrefix('interviewer', base);
const atBase = (absolutePath) => `${base}${absolutePath.slice(1)}`;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

const packageJson = JSON.parse(
  readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
);

if (isSubpath) {
  // The hosting deploy owns these rules (build.mjs removes the copies):
  // Netlify reads them only at the publish root.
  for (const file of ['_headers', '_redirects']) {
    if (existsSync(path.join(dist, file))) {
      fail(`a ${base} build must not ship dist/${file}`);
    }
  }
  // What Interviewer 9's bundler validates before it extracts a tarball into
  // its own dist/v8 (build.mjs writes it; the release packer rewrites the
  // tag and commit from the release it packs).
  let distInfo;
  try {
    distInfo = JSON.parse(
      readFileSync(path.join(dist, 'dist-info.json'), 'utf8'),
    );
  } catch {
    fail(`a ${base} build must write a valid dist/dist-info.json`);
  }
  if (
    distInfo.tag !== `@codaco/interviewer@${packageJson.version}` ||
    distInfo.version !== packageJson.version ||
    distInfo.base !== base ||
    distInfo.cachePrefix !== cachePrefix ||
    !(distInfo.commit === null || /^[0-9a-f]{40}$/.test(distInfo.commit))
  ) {
    fail(
      `dist/dist-info.json does not describe this ${base} build: ${JSON.stringify(distInfo)}`,
    );
  }
} else {
  try {
    assertPwaCacheHeaders({
      additionalStablePaths: ['/interviewer-icon.png'],
      text: readFileSync(path.join(dist, '_headers'), 'utf8'),
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  // The root dist is deployed as it stands; a stamp describing a sub-path
  // build would only mislead whoever reads it.
  if (existsSync(path.join(dist, 'dist-info.json'))) {
    fail('the root build must not ship dist/dist-info.json');
  }
}

const swPath = path.join(dist, 'sw.js');
let sw;
try {
  sw = readFileSync(swPath, 'utf8');
} catch {
  fail('missing dist/sw.js');
}

const expectedPrecachePrefixStart = `${cachePrefix}${packageJson.version}-`;
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
// The root build shares its origin with Interviewer 8 at /v8/ once Interviewer
// 9 hosts it, and 'interviewer-v8-' caches also start with 'interviewer-'. Its
// reclaimer must leave those caches and /v8/ windows alone; a sub-path build
// hosts no nested app.
const expectedForeignCachePrefixes = isSubpath ? [] : ['interviewer-v8-'];
const expectedForeignScopePaths = isSubpath ? [] : ['/v8/'];
if (
  !reclamationWorker.includes(
    `const foreignCachePrefixes = ${JSON.stringify(expectedForeignCachePrefixes)};`,
  ) ||
  !reclamationWorker.includes(
    `const foreignScopePaths = ${JSON.stringify(expectedForeignScopePaths)};`,
  )
) {
  fail(
    `cache reclaimer must treat exactly ${JSON.stringify(expectedForeignCachePrefixes)} caches and ${JSON.stringify(expectedForeignScopePaths)} windows as another app's`,
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

let manifest;
try {
  manifest = JSON.parse(
    readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'),
  );
} catch {
  fail('dist/manifest.webmanifest is not valid JSON');
}
if (manifest.start_url !== base || manifest.scope !== base) {
  fail(
    `manifest start_url and scope must be ${base}; found ${manifest.start_url} and ${manifest.scope}`,
  );
}
if (isSubpath) {
  // Opened inside Interviewer 9's window, never installed on its own: it must
  // be told apart from Interviewer 9 wherever the OS lists it, and must not
  // compete with it for .netcanvas launches.
  const expectedName = `Interviewer ${packageJson.version.split('.')[0]}`;
  if (manifest.name !== expectedName || manifest.short_name !== expectedName) {
    fail(`a ${base} build's manifest must be named ${expectedName}`);
  }
  if (manifest.id !== base) {
    fail(`a ${base} build's manifest id must be ${base}`);
  }
  if ('file_handlers' in manifest || 'launch_handler' in manifest) {
    fail(`a ${base} build must not register as a .netcanvas file handler`);
  }
} else if (manifest.file_handlers?.[0]?.action !== '/') {
  fail('the root build no longer opens launched .netcanvas files');
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

if (stagePreviewAssets.length === 0) {
  fail('no 4:3 stage-preview assets found');
}

const missingStagePreviewAssets = stagePreviewAssets.filter(
  (f) => !precached.has(`assets/${f}`),
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
// index.html must load its bundles from under the base: a root `/assets/`
// reference in a sub-path build would load the hosting app's files.
const htmlAssetRefs = [
  ...indexHtml.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g),
].map((match) => match[1]);
if (htmlAssetRefs.length === 0) {
  fail('dist/index.html references no bundled assets');
}
const offBaseAssetRefs = htmlAssetRefs.filter(
  (ref) => !ref.startsWith(atBase('/assets/')),
);
if (offBaseAssetRefs.length > 0) {
  fail(
    `dist/index.html loads assets from outside ${base}: ${offBaseAssetRefs.join(', ')}`,
  );
}
const initialLoad = new Set(
  [
    ...indexHtml.matchAll(
      new RegExp(
        `<(?:script[^>]*\\bsrc|link[^>]*\\bhref)="${escapeRegExp(atBase('/assets/'))}([^"]+\\.js)"`,
        'g',
      ),
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
// exactly when the feature it serves has to work offline. The Development
// protocol's ~33 MB chunk is dev-only, so it must never be precached.
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
  {
    prefix: 'bundledDevelopmentProtocol-',
    purpose: 'installing the development protocol',
    precache: false,
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

const interviewPath = atBase('/interview/');
const interviewRouteMatches = [
  ...sw.matchAll(
    new RegExp(
      `!?[$\\w]+\\.pathname\\.startsWith\\("${escapeRegExp(interviewPath)}"\\)`,
      'g',
    ),
  ),
];
const interviewCacheRoute = interviewRouteMatches.find(
  (match) => !match[0].startsWith('!'),
);
const freshShellRoute = interviewRouteMatches.find((match) =>
  match[0].startsWith('!'),
);
if (!interviewCacheRoute) {
  fail(`missing ${interviewPath} precached-shell navigation route`);
}
if (!freshShellRoute) {
  fail(`fresh-shell navigation route does not exclude ${interviewPath}`);
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
  `pathname.startsWith("${atBase('/assets/')}")`,
  freshShellRoute.index,
);
const imagesRouteIndex = sw.indexOf(
  `cacheName:"${cachePrefix}images"`,
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
  `cacheName:"${cachePrefix}fonts"`,
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
  if (!imagesRouteSource.includes(`"${atBase(stableIconPath)}"`)) {
    fail(
      `interviewer image-cache route includes stable icon ${stableIconPath}`,
    );
  }
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
if (
  !interviewRoute.includes(`cacheName:"${cachePrefix}interview-navigation"`)
) {
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
  !assetHandoffRouteSource.includes(`"${atBase('/assets/')}"`) ||
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
// The worker of a sub-path build only ever controls pages under its base, so
// a root path left in its route source is a matcher that can never fire.
if (isSubpath) {
  const routeSource = sw.slice(interviewCacheRoute.index);
  const rootPaths = [...routeSource.matchAll(/"(\/(?!\/)[^"]*)"/g)]
    .map((match) => match[1])
    .filter((literal) => !literal.startsWith(base));
  if (rootPaths.length > 0) {
    fail(
      `worker routes still match root paths outside ${base}: ${[...new Set(rootPaths)].join(', ')}`,
    );
  }
}

console.log(
  `PWA build ok (base ${base}): ${precachePrefix} retained independently; active-precache navigation fallbacks + exact-hash old-bundle JS/CSS and stage-preview handoff; no client claim; lease-gated old-precache cleanup; ${critical.length} critical chunk(s), ${localeChunks.length} lazily loaded locale chunk(s) and ${stagePreviewAssets.length} stage-preview asset(s) precached; ${deferredChunks.length} on-demand chunk(s) and faker outside the ${initialLoad.size}-chunk initial load`,
);
