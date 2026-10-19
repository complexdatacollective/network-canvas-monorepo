// Architect 8, served at /v8/ from this app's own deploy.
//
// Architect 9 does not build Architect 8. The 8.x release lane attaches a
// sub-path build of each release (`architect-v8-dist.tgz`, built with
// ARCHITECT_BASE_PATH=/v8/) to its GitHub release, and legacy-architect.json
// pins one of them by URL and sha256. After Vite has built this app,
// bundle-legacy-architect.mjs verifies that tarball and extracts it into
// dist/v8 — after the service worker is generated, so none of it enters this
// app's precache. See "Bundled Architect 8" in RELEASING.md.
//
// This module is the one place that reads the pin and the environment, so the
// `__ARCHITECT_V8__` define (vite.config.ts), the bundling step (build.mjs) and
// the build assertion (assert-pwa-build.mjs) always agree on whether this
// build carries Architect 8. Node loads it directly from build.mjs (type
// stripping), so it uses erasable syntax only.
//
// The environment:
//   ARCHITECT_REQUIRE_LEGACY_V8=true  fail unless Architect 8 is bundled (set
//                                     only by the production release builds)
//   ARCHITECT_SKIP_LEGACY_V8=true     build without Architect 8 even when pinned
//   ARCHITECT_LEGACY_V8_TARBALL=<path> use this local tarball instead of
//                                     downloading the pinned one (still
//                                     verified against the pin's sha256)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** The sub-path Architect 8 is served under, on this app's origin. */
export const LEGACY_ARCHITECT_V8_PATH = '/v8/';

/**
 * The cache prefix Architect 8's /v8/ build uses. This app's cache reclaimer is
 * told to leave caches with this prefix alone (vite.config.ts), so the bundled
 * build must use exactly this one.
 */
export const LEGACY_ARCHITECT_V8_CACHE_PREFIX = 'architect-v8-';

/** Where the bundled build lands inside this app's dist. */
export const LEGACY_ARCHITECT_V8_DIST_DIR = 'v8';

const LEGACY_ARCHITECT_V8_MAJOR = 8;
const PIN_FILE = 'legacy-architect.json';
const RELEASE_DOWNLOAD_PREFIX =
  'https://github.com/complexdatacollective/network-canvas-monorepo/releases/download/';
const TARBALL_NAME = 'architect-v8-dist.tgz';

/** One pinned sub-path build of Architect 8. */
export type LegacyArchitectPin = {
  version: string;
  url: string;
  sha256: string;
  cachePrefix: string;
};

type LegacyArchitectPins = { v8: LegacyArchitectPin | null };

/** What this build does about Architect 8, and why. */
export type LegacyArchitectResolution =
  | { bundled: true; pin: LegacyArchitectPin }
  | { bundled: false; pin: null; reason: 'unpinned' | 'skipped' };

/** What the app is told through `__ARCHITECT_V8__`. */
type LegacyArchitectDefine = {
  version: string;
  path: typeof LEGACY_ARCHITECT_V8_PATH;
} | null;

type Env = Record<string, string | undefined>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const releaseTag = (version: string) => `@codaco/architect@${version}`;

/**
 * Validate the contents of legacy-architect.json. An empty pin is `null`; a
 * pin names a stable 8.x release's sub-path tarball on this repository's
 * GitHub releases, its sha256, and the cache prefix its worker uses.
 */
export const parseLegacyArchitectPins = (
  value: unknown,
): LegacyArchitectPins => {
  if (!isRecord(value)) {
    throw new Error(`${PIN_FILE} must be an object such as { "v8": null }.`);
  }
  const unknownKeys = Object.keys(value).filter((key) => key !== 'v8');
  if (unknownKeys.length > 0 || !('v8' in value)) {
    throw new Error(
      `${PIN_FILE} must have exactly one key, "v8"; found ${JSON.stringify(Object.keys(value))}.`,
    );
  }
  const pin = value.v8;
  if (pin === null) return { v8: null };
  if (!isRecord(pin)) {
    throw new Error(`${PIN_FILE} "v8" must be null or a pin object.`);
  }

  const { version, url, sha256, cachePrefix } = pin;
  if (
    Object.keys(pin).length !== 4 ||
    typeof version !== 'string' ||
    typeof url !== 'string' ||
    typeof sha256 !== 'string' ||
    typeof cachePrefix !== 'string'
  ) {
    throw new Error(
      `${PIN_FILE} "v8" must have exactly the string fields version, url, sha256, cachePrefix.`,
    );
  }

  const versionMatch = /^(\d+)\.\d+\.\d+$/.exec(version);
  if (Number(versionMatch?.[1]) !== LEGACY_ARCHITECT_V8_MAJOR) {
    throw new Error(
      `${PIN_FILE} "v8".version must be a stable ${LEGACY_ARCHITECT_V8_MAJOR}.x release, got ${JSON.stringify(version)}.`,
    );
  }

  // GitHub percent-encodes the tag in browser_download_url; decode the tag
  // segment so either spelling of the same release is accepted.
  const tagSegment =
    url.startsWith(RELEASE_DOWNLOAD_PREFIX) && url.endsWith(`/${TARBALL_NAME}`)
      ? url.slice(RELEASE_DOWNLOAD_PREFIX.length, -(TARBALL_NAME.length + 1))
      : undefined;
  let tag: string | undefined;
  try {
    tag = tagSegment === undefined ? undefined : decodeURIComponent(tagSegment);
  } catch {
    tag = undefined;
  }
  if (tag !== releaseTag(version)) {
    throw new Error(
      `${PIN_FILE} "v8".url must be ${RELEASE_DOWNLOAD_PREFIX}${encodeURIComponent(releaseTag(version))}/${TARBALL_NAME}, got ${JSON.stringify(url)}.`,
    );
  }

  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(
      `${PIN_FILE} "v8".sha256 must be 64 lowercase hex characters.`,
    );
  }
  if (cachePrefix !== LEGACY_ARCHITECT_V8_CACHE_PREFIX) {
    throw new Error(
      `${PIN_FILE} "v8".cachePrefix must be "${LEGACY_ARCHITECT_V8_CACHE_PREFIX}", the prefix this app's cache reclaimer leaves alone; got ${JSON.stringify(cachePrefix)}.`,
    );
  }
  return { v8: { version, url, sha256, cachePrefix } };
};

const readFlag = (env: Env, name: string): boolean => {
  const value = env[name]?.trim().toLowerCase() ?? '';
  if (value === '' || value === 'false' || value === '0') return false;
  if (value === 'true' || value === '1') return true;
  throw new Error(
    `${name} must be "true" or "false", got ${JSON.stringify(env[name])}.`,
  );
};

/**
 * Decide whether this build bundles Architect 8. Throws — the production
 * guard — when ARCHITECT_REQUIRE_LEGACY_V8 is set and it would not.
 */
export const resolveLegacyArchitectV8 = ({
  pins,
  env,
}: {
  pins: LegacyArchitectPins;
  env: Env;
}): LegacyArchitectResolution => {
  const required = readFlag(env, 'ARCHITECT_REQUIRE_LEGACY_V8');
  const skipped = readFlag(env, 'ARCHITECT_SKIP_LEGACY_V8');
  if (required && skipped) {
    throw new Error(
      'ARCHITECT_REQUIRE_LEGACY_V8 and ARCHITECT_SKIP_LEGACY_V8 are both set; a build that must bundle Architect 8 cannot skip it.',
    );
  }
  if (required && pins.v8 === null) {
    throw new Error(
      `ARCHITECT_REQUIRE_LEGACY_V8 is set, but apps/architect/${PIN_FILE} pins no Architect 8 build. A production Architect 9 must serve Architect 8 at ${LEGACY_ARCHITECT_V8_PATH}; pin a released architect-v8-dist.tgz first (see "Bundled Architect 8" in apps/architect/RELEASING.md).`,
    );
  }
  if (skipped) return { bundled: false, pin: null, reason: 'skipped' };
  if (pins.v8 === null)
    return { bundled: false, pin: null, reason: 'unpinned' };
  return { bundled: true, pin: pins.v8 };
};

/** Read legacy-architect.json from the app root and resolve it against `env`. */
export const loadLegacyArchitectV8 = (
  appRoot: string,
  env: Env,
): LegacyArchitectResolution => {
  const pinPath = join(appRoot, PIN_FILE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(pinPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `could not read ${pinPath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return resolveLegacyArchitectV8({
    pins: parseLegacyArchitectPins(parsed),
    env,
  });
};

/** The value of the `__ARCHITECT_V8__` define for this resolution. */
export const legacyArchitectDefine = (
  resolution: LegacyArchitectResolution,
): LegacyArchitectDefine =>
  resolution.bundled
    ? { version: resolution.pin.version, path: LEGACY_ARCHITECT_V8_PATH }
    : null;

const listFiles = (directory: string): string[] =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)));

/**
 * Files that must not be served from inside the bundled build: Netlify reads
 * `_headers` and `_redirects` only at the publish root, so nested copies would
 * just be public dead files, and a source map would publish Architect 8's
 * source.
 */
export const findLegacyArchitectHostingFiles = (directory: string): string[] =>
  listFiles(directory).filter(
    (file) =>
      file === '_headers' || file === '_redirects' || file.endsWith('.map'),
  );

const PRECACHE_PREFIX = /setCacheNameDetails\(\{prefix:"([^"]+)"\}\)/;
const ROOT_ASSET_REFERENCE = /(?:src|href)="\/assets\//;

/**
 * Check that `directory` holds the sub-path build `pin` names, in the layout
 * the 8.x release lane packs (scripts/release/package-architect-subpath-dist.mjs
 * on main): the dist root plus dist-info.json, built for /v8/, precaching
 * under the pinned cache prefix. Throws on the first mismatch.
 */
export const validateLegacyArchitectDist = (
  directory: string,
  pin: LegacyArchitectPin,
): void => {
  const read = (file: string) => {
    const path = join(directory, file);
    if (!existsSync(path)) {
      throw new Error(`the Architect 8 build is missing ${file}.`);
    }
    return readFileSync(path, 'utf8');
  };

  const infoText = read('dist-info.json');
  let info: unknown;
  try {
    info = JSON.parse(infoText);
  } catch (error) {
    throw new Error(
      `the Architect 8 build's dist-info.json is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const expectedInfo = {
    tag: releaseTag(pin.version),
    version: pin.version,
    base: LEGACY_ARCHITECT_V8_PATH,
    cachePrefix: pin.cachePrefix,
  };
  if (!isRecord(info)) {
    throw new Error("the Architect 8 build's dist-info.json is not an object.");
  }
  for (const [field, expected] of Object.entries(expectedInfo)) {
    if (info[field] !== expected) {
      throw new Error(
        `the Architect 8 build's dist-info.json has ${field} ${JSON.stringify(info[field])}, but the pin needs ${JSON.stringify(expected)}.`,
      );
    }
  }
  if (typeof info.commit !== 'string' || !/^[0-9a-f]{40}$/.test(info.commit)) {
    throw new Error(
      "the Architect 8 build's dist-info.json does not name the full commit it was built from.",
    );
  }

  // The prefix the worker actually uses, not only the one the label claims:
  // this app's reclaimer leaves exactly the pinned prefix alone.
  const precachePrefix = PRECACHE_PREFIX.exec(read('sw.js'))?.[1];
  if (!precachePrefix?.startsWith(`${pin.cachePrefix}${pin.version}-`)) {
    throw new Error(
      `the Architect 8 build precaches under ${JSON.stringify(precachePrefix ?? null)}, not ${pin.cachePrefix}${pin.version}-….`,
    );
  }

  for (const file of ['index.html', 'preview/index.html']) {
    const html = read(file);
    if (!html.includes(`${LEGACY_ARCHITECT_V8_PATH}assets/`)) {
      throw new Error(
        `the Architect 8 build's ${file} does not load its assets from ${LEGACY_ARCHITECT_V8_PATH}assets/.`,
      );
    }
    if (ROOT_ASSET_REFERENCE.test(html)) {
      throw new Error(
        `the Architect 8 build's ${file} loads assets from /assets/, which is this app's.`,
      );
    }
  }

  const manifestText = read('manifest.webmanifest');
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    throw new Error(
      `the Architect 8 build's manifest.webmanifest is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  for (const field of ['start_url', 'scope']) {
    const actual = isRecord(manifest) ? manifest[field] : undefined;
    if (actual !== LEGACY_ARCHITECT_V8_PATH) {
      throw new Error(
        `the Architect 8 build's manifest ${field} is ${JSON.stringify(actual)}, not ${LEGACY_ARCHITECT_V8_PATH}.`,
      );
    }
  }
};

/**
 * Map a `vite preview` request under /v8/ the way Netlify serves it with
 * public/_redirects: `/v8` redirects to `/v8/` (Netlify's own handling of a
 * directory with an index.html; the middleware only runs while
 * dist/v8/index.html exists), an existing file is served as it is, a directory with an index.html (such as /v8/preview/) gets that
 * index, and any other path under /v8/ gets Architect 8's shell. Returns null
 * for a request this app serves itself.
 */
export const legacyArchitectPreviewRoute = (
  pathname: string,
  fileExists: (relativePath: string) => boolean,
): { redirect: string } | { rewrite: string } | { serve: true } | null => {
  if (pathname === '/v8') return { redirect: LEGACY_ARCHITECT_V8_PATH };
  if (!pathname.startsWith(LEGACY_ARCHITECT_V8_PATH)) return null;
  const relativePath = pathname.slice(LEGACY_ARCHITECT_V8_PATH.length);
  if (!relativePath.split('/').includes('..')) {
    if (relativePath === '' || relativePath.endsWith('/')) {
      const index = `${relativePath}index.html`;
      if (fileExists(index)) {
        return { rewrite: `${LEGACY_ARCHITECT_V8_PATH}${index}` };
      }
    } else if (fileExists(relativePath)) {
      return { serve: true };
    }
  }
  return { rewrite: `${LEGACY_ARCHITECT_V8_PATH}index.html` };
};
