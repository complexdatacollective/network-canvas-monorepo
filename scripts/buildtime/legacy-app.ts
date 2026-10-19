// The previous major of an app, served at /v8/ from the newer major's own
// deploy: Architect 8 inside Architect 9, Interviewer 8 inside Interviewer 9.
//
// The newer major does not build the older one. The 8.x release lane attaches
// a sub-path build of each release (`<app>-v8-dist.tgz`, built with
// <APP>_BASE_PATH=/v8/ and packed by scripts/release/package-app-subpath-dist.mjs
// on main) to its GitHub release, and `apps/<app>/legacy-<app>.json` pins one
// of them by URL and sha256. After Vite has built the app,
// bundle-legacy-app.mjs verifies that tarball and extracts it into dist/v8 —
// after the service worker is generated, so none of it enters the newer app's
// precache. See "Bundled <App> 8" in apps/<app>/RELEASING.md.
//
// This module is the one place that reads the pin and the environment, so an
// app's `__<APP>_V8__` define (vite.config.ts), its bundling step (build.mjs)
// and its build assertion (assert-pwa-build.mjs) always agree on whether the
// build carries the older major. Node loads it directly from build scripts
// and vite.config.ts (type stripping), so it uses erasable syntax only.
//
// The environment, for app `interviewer` (Architect's are ARCHITECT_…):
//   INTERVIEWER_REQUIRE_LEGACY_V8=true   fail unless Interviewer 8 is bundled
//                                        (set only by the production release
//                                        builds)
//   INTERVIEWER_SKIP_LEGACY_V8=true      build without it even when pinned
//   INTERVIEWER_LEGACY_V8_TARBALL=<path> use this local tarball instead of
//                                        downloading the pinned one (still
//                                        verified against the pin's sha256)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** The major the older app runs; its build is served under `/v<major>/`. */
const LEGACY_MAJOR = 8;

/** The sub-path the older major is served under, on the newer app's origin. */
const LEGACY_APP_PATH = '/v8/';

/** Where the bundled build lands inside the newer app's dist. */
export const LEGACY_APP_DIST_DIR = 'v8';

const RELEASE_DOWNLOAD_PREFIX =
  'https://github.com/complexdatacollective/network-canvas-monorepo/releases/download/';

/**
 * The apps that serve their previous major at /v8/. `htmlEntries` are the
 * HTML documents the older build emits, each of which must load its bundles
 * from under /v8/ (the same list as package-app-subpath-dist.mjs on main).
 */
const LEGACY_APP_CONFIGS = {
  interviewer: {
    label: 'Interviewer',
    envPrefix: 'INTERVIEWER',
    htmlEntries: ['index.html'],
  },
} as const satisfies Record<
  string,
  { label: string; envPrefix: string; htmlEntries: readonly string[] }
>;

export type LegacyAppName = keyof typeof LEGACY_APP_CONFIGS;

/** Every name one app's older major is known by, derived from the app. */
export type LegacyApp = {
  /** The app's directory under apps/, such as `interviewer`. */
  name: LegacyAppName;
  /** `Interviewer`. */
  appLabel: string;
  /** `Interviewer 8`. */
  label: string;
  /** `legacy-interviewer.json`, at the app's root. */
  pinFile: string;
  /** `interviewer-v8-dist.tgz`, the release asset the pin names. */
  tarballName: string;
  /**
   * `interviewer-v8-`: the newer app's cache reclaimer is told to leave caches
   * with this prefix alone, so the bundled build must use exactly this one.
   */
  cachePrefix: string;
  htmlEntries: readonly string[];
  /** `__INTERVIEWER_V8__`, the define that tells the app what it bundled. */
  defineName: string;
  env: { require: string; skip: string; tarball: string };
  /** `interviewer-legacy`, under the app's node_modules/.cache. */
  cacheDirName: string;
  /** `@codaco/interviewer@<version>`, the release tag a pin must name. */
  releaseTag: (version: string) => string;
};

const isLegacyAppName = (name: string): name is LegacyAppName =>
  Object.hasOwn(LEGACY_APP_CONFIGS, name);

/** The names for `name`'s older major. Throws for an app that has none. */
export const legacyApp = (name: string): LegacyApp => {
  if (!isLegacyAppName(name)) {
    throw new Error(
      `'${name}' serves no older major at ${LEGACY_APP_PATH}. Expected one of: ${Object.keys(LEGACY_APP_CONFIGS).join(', ')}.`,
    );
  }
  const { label, envPrefix, htmlEntries } = LEGACY_APP_CONFIGS[name];
  return {
    name,
    appLabel: label,
    label: `${label} ${LEGACY_MAJOR}`,
    pinFile: `legacy-${name}.json`,
    tarballName: `${name}-v${LEGACY_MAJOR}-dist.tgz`,
    cachePrefix: `${name}-v${LEGACY_MAJOR}-`,
    htmlEntries,
    defineName: `__${envPrefix}_V${LEGACY_MAJOR}__`,
    env: {
      require: `${envPrefix}_REQUIRE_LEGACY_V${LEGACY_MAJOR}`,
      skip: `${envPrefix}_SKIP_LEGACY_V${LEGACY_MAJOR}`,
      tarball: `${envPrefix}_LEGACY_V${LEGACY_MAJOR}_TARBALL`,
    },
    cacheDirName: `${name}-legacy`,
    releaseTag: (version) => `@codaco/${name}@${version}`,
  };
};

/** One pinned sub-path build of the older major. */
export type LegacyAppPin = {
  version: string;
  url: string;
  sha256: string;
  cachePrefix: string;
};

type LegacyAppPins = { v8: LegacyAppPin | null };

/** What a build does about the older major, and why. */
export type LegacyAppResolution =
  | { bundled: true; pin: LegacyAppPin }
  | { bundled: false; pin: null; reason: 'unpinned' | 'skipped' };

/** What the app is told through its `__<APP>_V8__` define. */
type LegacyAppDefine = {
  version: string;
  path: typeof LEGACY_APP_PATH;
} | null;

type Env = Record<string, string | undefined>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validate the contents of `legacy-<app>.json`. An empty pin is `null`; a pin
 * names a stable 8.x release's sub-path tarball on this repository's GitHub
 * releases, its sha256, and the cache prefix its worker uses.
 */
export const parseLegacyAppPins = (
  app: LegacyApp,
  value: unknown,
): LegacyAppPins => {
  const file = app.pinFile;
  if (!isRecord(value)) {
    throw new Error(`${file} must be an object such as { "v8": null }.`);
  }
  const unknownKeys = Object.keys(value).filter((key) => key !== 'v8');
  if (unknownKeys.length > 0 || !('v8' in value)) {
    throw new Error(
      `${file} must have exactly one key, "v8"; found ${JSON.stringify(Object.keys(value))}.`,
    );
  }
  const pin = value.v8;
  if (pin === null) return { v8: null };
  if (!isRecord(pin)) {
    throw new Error(`${file} "v8" must be null or a pin object.`);
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
      `${file} "v8" must have exactly the string fields version, url, sha256, cachePrefix.`,
    );
  }

  const versionMatch = /^(\d+)\.\d+\.\d+$/.exec(version);
  if (Number(versionMatch?.[1]) !== LEGACY_MAJOR) {
    throw new Error(
      `${file} "v8".version must be a stable ${LEGACY_MAJOR}.x release, got ${JSON.stringify(version)}.`,
    );
  }

  // GitHub percent-encodes the tag in browser_download_url; decode the tag
  // segment so either spelling of the same release is accepted.
  const tagSegment =
    url.startsWith(RELEASE_DOWNLOAD_PREFIX) &&
    url.endsWith(`/${app.tarballName}`)
      ? url.slice(RELEASE_DOWNLOAD_PREFIX.length, -(app.tarballName.length + 1))
      : undefined;
  let tag: string | undefined;
  try {
    tag = tagSegment === undefined ? undefined : decodeURIComponent(tagSegment);
  } catch {
    tag = undefined;
  }
  if (tag !== app.releaseTag(version)) {
    throw new Error(
      `${file} "v8".url must be ${RELEASE_DOWNLOAD_PREFIX}${encodeURIComponent(app.releaseTag(version))}/${app.tarballName}, got ${JSON.stringify(url)}.`,
    );
  }

  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`${file} "v8".sha256 must be 64 lowercase hex characters.`);
  }
  if (cachePrefix !== app.cachePrefix) {
    throw new Error(
      `${file} "v8".cachePrefix must be "${app.cachePrefix}", the prefix this app's cache reclaimer leaves alone; got ${JSON.stringify(cachePrefix)}.`,
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
 * Decide whether this build bundles the older major. Throws — the production
 * guard — when `<APP>_REQUIRE_LEGACY_V8` is set and it would not.
 */
export const resolveLegacyAppV8 = ({
  app,
  pins,
  env,
}: {
  app: LegacyApp;
  pins: LegacyAppPins;
  env: Env;
}): LegacyAppResolution => {
  const required = readFlag(env, app.env.require);
  const skipped = readFlag(env, app.env.skip);
  if (required && skipped) {
    throw new Error(
      `${app.env.require} and ${app.env.skip} are both set; a build that must bundle ${app.label} cannot skip it.`,
    );
  }
  if (required && pins.v8 === null) {
    throw new Error(
      `${app.env.require} is set, but apps/${app.name}/${app.pinFile} pins no ${app.label} build. A production build must serve ${app.label} at ${LEGACY_APP_PATH}; pin a released ${app.tarballName} first (see "Bundled ${app.label}" in apps/${app.name}/RELEASING.md).`,
    );
  }
  if (skipped) return { bundled: false, pin: null, reason: 'skipped' };
  if (pins.v8 === null)
    return { bundled: false, pin: null, reason: 'unpinned' };
  return { bundled: true, pin: pins.v8 };
};

/** Read the app's pin file from its root and resolve it against `env`. */
export const loadLegacyAppV8 = (
  app: LegacyApp,
  appRoot: string,
  env: Env,
): LegacyAppResolution => {
  const pinPath = join(appRoot, app.pinFile);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(pinPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `could not read ${pinPath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return resolveLegacyAppV8({
    app,
    pins: parseLegacyAppPins(app, parsed),
    env,
  });
};

/** The value of the app's `__<APP>_V8__` define for this resolution. */
export const legacyAppDefine = (
  resolution: LegacyAppResolution,
): LegacyAppDefine =>
  resolution.bundled
    ? { version: resolution.pin.version, path: LEGACY_APP_PATH }
    : null;

const listFiles = (directory: string): string[] =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)));

/**
 * Files that must not be served from inside the bundled build: Netlify reads
 * `_headers` and `_redirects` only at the publish root, so nested copies would
 * just be public dead files, and a source map would publish the older
 * major's source.
 */
export const findLegacyAppHostingFiles = (directory: string): string[] =>
  listFiles(directory).filter(
    (file) =>
      file === '_headers' || file === '_redirects' || file.endsWith('.map'),
  );

const PRECACHE_PREFIX = /setCacheNameDetails\(\{prefix:"([^"]+)"\}\)/;
const ROOT_ASSET_REFERENCE = /(?:src|href)="\/assets\//;

/**
 * Check that `directory` holds the sub-path build `pin` names, in the layout
 * the 8.x release lane packs: the dist root plus dist-info.json, built for
 * /v8/, precaching under the pinned cache prefix. Throws on the first
 * mismatch.
 */
export const validateLegacyAppDist = (
  app: LegacyApp,
  directory: string,
  pin: LegacyAppPin,
): void => {
  const read = (file: string) => {
    const path = join(directory, file);
    if (!existsSync(path)) {
      throw new Error(`the ${app.label} build is missing ${file}.`);
    }
    return readFileSync(path, 'utf8');
  };

  const infoText = read('dist-info.json');
  let info: unknown;
  try {
    info = JSON.parse(infoText);
  } catch (error) {
    throw new Error(
      `the ${app.label} build's dist-info.json is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const expectedInfo = {
    tag: app.releaseTag(pin.version),
    version: pin.version,
    base: LEGACY_APP_PATH,
    cachePrefix: pin.cachePrefix,
  };
  if (!isRecord(info)) {
    throw new Error(
      `the ${app.label} build's dist-info.json is not an object.`,
    );
  }
  for (const [field, expected] of Object.entries(expectedInfo)) {
    if (info[field] !== expected) {
      throw new Error(
        `the ${app.label} build's dist-info.json has ${field} ${JSON.stringify(info[field])}, but the pin needs ${JSON.stringify(expected)}.`,
      );
    }
  }
  if (typeof info.commit !== 'string' || !/^[0-9a-f]{40}$/.test(info.commit)) {
    throw new Error(
      `the ${app.label} build's dist-info.json does not name the full commit it was built from.`,
    );
  }

  // The prefix the worker actually uses, not only the one the label claims:
  // the newer app's reclaimer leaves exactly the pinned prefix alone.
  const precachePrefix = PRECACHE_PREFIX.exec(read('sw.js'))?.[1];
  if (!precachePrefix?.startsWith(`${pin.cachePrefix}${pin.version}-`)) {
    throw new Error(
      `the ${app.label} build precaches under ${JSON.stringify(precachePrefix ?? null)}, not ${pin.cachePrefix}${pin.version}-….`,
    );
  }

  for (const file of app.htmlEntries) {
    const html = read(file);
    if (!html.includes(`${LEGACY_APP_PATH}assets/`)) {
      throw new Error(
        `the ${app.label} build's ${file} does not load its assets from ${LEGACY_APP_PATH}assets/.`,
      );
    }
    if (ROOT_ASSET_REFERENCE.test(html)) {
      throw new Error(
        `the ${app.label} build's ${file} loads assets from /assets/, which is this app's.`,
      );
    }
  }

  const manifestText = read('manifest.webmanifest');
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    throw new Error(
      `the ${app.label} build's manifest.webmanifest is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  for (const field of ['start_url', 'scope']) {
    const actual = isRecord(manifest) ? manifest[field] : undefined;
    if (actual !== LEGACY_APP_PATH) {
      throw new Error(
        `the ${app.label} build's manifest ${field} is ${JSON.stringify(actual)}, not ${LEGACY_APP_PATH}.`,
      );
    }
  }
};

/**
 * Map a `vite preview` request under /v8/ the way Netlify serves it with the
 * app's public/_redirects: `/v8` redirects to `/v8/` (Netlify's own handling
 * of a directory with an index.html; the middleware only runs while
 * dist/v8/index.html exists), an existing file is served as it is, a directory
 * with an index.html (such as Architect 8's /v8/preview/) gets that index, and
 * any other path under /v8/ gets the older major's shell. Returns null for a
 * request the newer app serves itself.
 */
export const legacyAppPreviewRoute = (
  pathname: string,
  fileExists: (relativePath: string) => boolean,
): { redirect: string } | { rewrite: string } | { serve: true } | null => {
  if (pathname === '/v8') return { redirect: LEGACY_APP_PATH };
  if (!pathname.startsWith(LEGACY_APP_PATH)) return null;
  const relativePath = pathname.slice(LEGACY_APP_PATH.length);
  if (!relativePath.split('/').includes('..')) {
    if (relativePath === '' || relativePath.endsWith('/')) {
      const index = `${relativePath}index.html`;
      if (fileExists(index)) {
        return { rewrite: `${LEGACY_APP_PATH}${index}` };
      }
    } else if (fileExists(relativePath)) {
      return { serve: true };
    }
  }
  return { rewrite: `${LEGACY_APP_PATH}index.html` };
};
