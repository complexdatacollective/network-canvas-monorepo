// The URL path Architect is built to be served under. Unset (or `/`) is the
// root build every deploy has always used. A sub-path such as `/v8/` is how
// Architect 8 ships inside Architect 9's deploy: same origin, its own worker
// scope, caches and manifest identity.
//
// Plain ESM rather than TypeScript because two loaders read it: Vite's config
// bundler (vite.config.ts) and Node itself (assert-pwa-build.mjs runs after
// the build without any compile step).

const BASE_PATH_PATTERN = /^\/(?:[a-z0-9-]+\/)*$/;

/**
 * Normalise `ARCHITECT_BASE_PATH` to `/` or `/segment/…/`. Anything outside
 * lowercase letters, digits and hyphens is refused rather than escaped: the
 * value ends up inside service-worker source, cache names and the manifest.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function resolveArchitectBasePath(env) {
  const raw = env.ARCHITECT_BASE_PATH?.trim() ?? '';
  if (raw === '' || raw === '/') return '/';

  const base = `/${raw.replace(/^\/+|\/+$/g, '')}/`;
  if (!BASE_PATH_PATTERN.test(base)) {
    throw new Error(
      `ARCHITECT_BASE_PATH must be "/" or a path such as "/v8/" (lowercase letters, digits and hyphens); received ${JSON.stringify(raw)}`,
    );
  }
  return base;
}

/**
 * The prefix every cache this build's worker owns starts with. The root build
 * keeps `architect-`, which its existing users' caches already carry; a
 * sub-path build gets `architect-<segments>-` (e.g. `architect-v8-`) so the
 * two workers on one origin never share or prune each other's caches.
 *
 * @param {string} base
 * @returns {string}
 */
export function architectCachePrefix(base) {
  if (base === '/') return 'architect-';
  return `architect-${base.slice(1, -1).replaceAll('/', '-')}-`;
}

/**
 * Rebase every quoted root-absolute path literal in a service-worker matcher
 * onto `base`.
 *
 * Workbox serialises each runtime-caching `urlPattern` into sw.js with
 * `toString()`, so a matcher cannot read the base from a closure: whatever it
 * compares against has to be a literal in its own body. At the root the
 * function is returned untouched, so a root build's worker source is exactly
 * what it was before sub-path builds existed. Otherwise `"/preview/"` becomes
 * `"/v8/preview/"`, and the rewritten source is compiled back into a function
 * so Workbox serialises the rebased text. Protocol-relative `//host` strings
 * and regular-expression literals are left alone.
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
