// The parts of assert-pwa-build.mjs that keep Architect 8, served at /v8/
// from this deploy, out of this app's way: its worker must never precache,
// answer or cache anything under /v8/, the hosting rules must hand /v8/ deep
// links to Architect 8's shell (without a redirect loop), and dist/v8 must hold exactly what the pin
// names (or nothing at all). Kept apart from that script, which runs on
// import, so they can be tested.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  findLegacyArchitectHostingFiles,
  LEGACY_ARCHITECT_V8_DIST_DIR,
  type LegacyArchitectResolution,
  validateLegacyArchitectDist,
} from './legacy-architect.ts';

/**
 * Precache entries under v8/. The build order already keeps dist/v8 out (it is
 * written after the worker is generated) and `globIgnores` repeats that; this
 * is the check that fails if either stops holding.
 */
export const findLegacyPrecacheEntries = (sw: string): string[] =>
  [...sw.matchAll(/url:"(\/?v8\/[^"]*)"/g)].map((match) => match[1] ?? '');

/**
 * The matcher function of the route `index` falls in, in the minified worker:
 * from the last `registerRoute(` at or before `index` to the handler that
 * follows it.
 */
export const routeMatcherAt = (sw: string, index: number): string => {
  const start = sw.lastIndexOf('registerRoute(', index);
  if (start === -1) return '';
  const end = sw.indexOf(',new ', start);
  return sw.slice(start, end === -1 ? undefined : end);
};

const excludesV8Prefix = (source: string) =>
  /![$\w]+\.pathname\.startsWith\("\/v8\/"\)/.test(source);

/**
 * Workbox serialises each route's matcher into the worker, so the exclusions
 * have to be literals in each one; this checks the emitted source.
 */
export const assertLegacyRouteExclusions = ({
  freshShell,
  image,
  font,
}: {
  freshShell: string;
  image: string;
  font: string;
}): void => {
  if (
    !excludesV8Prefix(freshShell) ||
    !/(?:"\/v8"!==[$\w]+\.pathname|[$\w]+\.pathname!=="\/v8")/.test(freshShell)
  ) {
    throw new Error(
      'the fresh-shell navigation route answers /v8 and /v8/ navigations with this app’s shell',
    );
  }
  if (!excludesV8Prefix(image)) {
    throw new Error('the image cache route caches Architect 8’s images');
  }
  const sameOriginOnly =
    /^registerRoute\(\(\{[^}]*\bsameOrigin:([$\w]+)[^}]*\}\)=>\1&&/.test(font);
  if (!excludesV8Prefix(font) || !sameOriginOnly) {
    throw new Error(
      'the font cache route caches Architect 8’s fonts or no longer requires a same-origin request',
    );
  }
};

type RedirectRule = { from: string; to: string; status: string };

const parseRedirects = (text: string): RedirectRule[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const [from = '', to = '', status = ''] = line.split(/\s+/);
      return { from, to, status };
    });

// Netlify drops a trailing slash before matching a rule, so a rule from a
// path to the same path with (or without) a trailing slash matches its own
// target and redirects forever.
const withoutTrailingSlash = (path: string) =>
  path.length > 1 ? path.replace(/\/+$/, '') : path;

/**
 * `/v8/*` must rewrite to Architect 8's shell before the catch-all hands every
 * path to this app's shell, and no rule may redirect a path to itself.
 *
 * In particular there is no `/v8 /v8/ 301`: Netlify's normalisation makes it
 * a loop whenever nothing exists at `/v8/` to shadow it (no Architect 8 is
 * bundled). Where `dist/v8/index.html` exists, Netlify's own directory
 * handling already takes `/v8` to it.
 */
export const assertLegacyRedirects = (text: string): void => {
  const rules = parseRedirects(text);
  const selfRedirect = rules.find(
    (rule) =>
      /^3\d\d!?$/.test(rule.status) &&
      withoutTrailingSlash(rule.from) === withoutTrailingSlash(rule.to),
  );
  if (selfRedirect) {
    throw new Error(
      `_redirects sends ${selfRedirect.from} to ${selfRedirect.to}, which Netlify treats as the same path, so it redirects forever`,
    );
  }
  const indexOf = (from: string, to: string, status: string) =>
    rules.findIndex(
      (rule) => rule.from === from && rule.to === to && rule.status === status,
    );
  const catchAll = indexOf('/*', '/index.html', '200');
  const deep = indexOf('/v8/*', '/v8/index.html', '200');
  if (catchAll === -1) {
    throw new Error('_redirects has no "/* /index.html 200" rule');
  }
  if (deep === -1 || deep > catchAll) {
    throw new Error(
      '_redirects does not send /v8/* to Architect 8’s shell before its catch-all',
    );
  }
};

/**
 * dist/v8 holds the pinned build, under a cache prefix this app's reclaimer
 * leaves alone, with no hosting files of its own; or, when nothing is bundled,
 * does not exist.
 */
export const assertLegacyArchitectOutput = ({
  dist,
  resolution,
  foreignCachePrefixes,
}: {
  dist: string;
  resolution: LegacyArchitectResolution;
  foreignCachePrefixes: readonly string[];
}): void => {
  const directory = join(dist, LEGACY_ARCHITECT_V8_DIST_DIR);
  if (!resolution.bundled) {
    if (existsSync(directory)) {
      throw new Error(
        `dist/${LEGACY_ARCHITECT_V8_DIST_DIR} exists, but this build bundles no Architect 8 (${resolution.reason})`,
      );
    }
    return;
  }
  if (!foreignCachePrefixes.includes(resolution.pin.cachePrefix)) {
    throw new Error(
      `the bundled Architect 8 caches under "${resolution.pin.cachePrefix}", which this app's cache reclaimer does not leave alone`,
    );
  }
  if (!existsSync(directory)) {
    throw new Error(
      `this build bundles Architect ${resolution.pin.version}, but dist/${LEGACY_ARCHITECT_V8_DIST_DIR} is missing`,
    );
  }
  validateLegacyArchitectDist(directory, resolution.pin);
  const leftovers = findLegacyArchitectHostingFiles(directory);
  if (leftovers.length > 0) {
    throw new Error(
      `dist/${LEGACY_ARCHITECT_V8_DIST_DIR} carries files it must not serve: ${leftovers.join(', ')}`,
    );
  }
};
