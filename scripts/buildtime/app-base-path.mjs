// The URL path a PWA app is built to be served under. Unset (or `/`) is the
// root build every deploy has always used. A sub-path such as `/v8/` is how an
// app's previous major ships inside the next major's deploy: same origin, its
// own worker scope, caches and manifest identity.
//
// Shared by every app that builds a sub-path variant (Interviewer, and
// Architect's own copy until it switches over), so the rules for what a base
// may be, and how it reaches cache names and worker source, cannot drift.
//
// Plain ESM rather than TypeScript because two loaders read it: Vite's config
// bundler (vite.config.ts) and Node itself (assert-pwa-build.mjs runs after
// the build without any compile step).

const BASE_PATH_PATTERN = /^\/(?:[a-z0-9-]+\/)*$/;

/**
 * Normalise the base-path variable `variableName` (for example
 * `INTERVIEWER_BASE_PATH`) to `/` or `/segment/…/`. Anything outside lowercase
 * letters, digits and hyphens is refused rather than escaped: the value ends
 * up inside service-worker source, cache names and the manifest.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string} variableName
 * @returns {string}
 */
export function resolveAppBasePath(env, variableName) {
  const raw = env[variableName]?.trim() ?? '';
  if (raw === '' || raw === '/') return '/';

  const base = `/${raw.replace(/^\/+|\/+$/g, '')}/`;
  if (!BASE_PATH_PATTERN.test(base)) {
    throw new Error(
      `${variableName} must be "/" or a path such as "/v8/" (lowercase letters, digits and hyphens); received ${JSON.stringify(raw)}`,
    );
  }
  return base;
}

/**
 * The prefix every cache this build's worker owns starts with. The root build
 * keeps `<app>-`, which its existing users' caches already carry; a sub-path
 * build gets `<app>-<segments>-` (e.g. `interviewer-v8-`) so the two workers
 * on one origin never share or prune each other's caches.
 *
 * @param {string} appName lowercase, such as `interviewer`
 * @param {string} base
 * @returns {string}
 */
export function appCachePrefix(appName, base) {
  if (base === '/') return `${appName}-`;
  return `${appName}-${base.slice(1, -1).replaceAll('/', '-')}-`;
}

/**
 * Rebase every quoted root-absolute path literal in a service-worker matcher
 * onto `base`.
 *
 * Workbox serialises each runtime-caching `urlPattern` into sw.js with
 * `toString()`, so a matcher cannot read the base from a closure: whatever it
 * compares against has to be a literal in its own body. At the root the
 * function is returned untouched, so a root build's worker source is exactly
 * what it was before sub-path builds existed. Otherwise `"/interview/"`
 * becomes `"/v8/interview/"`, and the rewritten source is compiled back into a
 * function so Workbox serialises the rebased text. Protocol-relative `//host`
 * strings and regular-expression literals are left alone.
 *
 * @template {(...args: never[]) => unknown} T
 * @param {T} matcher
 * @param {string} base
 * @returns {T}
 */
export function rebaseSwMatcher(matcher, base) {
  if (base === '/') return matcher;
  const source = matcher
    .toString()
    .replace(/(["'`])\/(?!\/)/g, (_match, quote) => `${quote}${base}`);
  // oxlint-disable-next-line typescript/no-implied-eval -- build-time only: the matcher's own source, rebased, becomes worker source either way
  return new Function(`return (${source});`)();
}
