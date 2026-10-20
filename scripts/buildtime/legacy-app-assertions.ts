// The parts of an app's assert-pwa-build.mjs that keep its older major,
// served at /v8/ from the same deploy, out of the newer app's way: the newer
// worker must never precache, answer or cache anything under /v8/, the
// hosting rules must hand /v8/ deep links to the older major's shell
// (without a redirect loop), and dist/v8 must hold exactly what the pin names
// (or nothing at all). Kept apart from those scripts, which run on import, so
// they can be tested.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  findLegacyAppHostingFiles,
  LEGACY_APP_DIST_DIR,
  type LegacyApp,
  type LegacyAppResolution,
  validateLegacyAppDist,
} from './legacy-app.ts';

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

const requiresSameOrigin = (source: string) =>
  /^registerRoute\(\(\{[^}]*\bsameOrigin:([$\w]+)[^}]*\}\)=>\1&&/.test(source);

/**
 * Workbox serialises each route's matcher into the worker, so the exclusions
 * have to be literals in each one; this checks the emitted source. The
 * fresh-shell navigation route must leave both `/v8` and `/v8/…` alone, and
 * the image and font cache routes everything under `/v8/`. A route named in
 * `sameOriginRoutes` must also match only same-origin requests (a function
 * route matches every origin unless it says so).
 */
export const assertLegacyRouteExclusions = ({
  app,
  freshShell,
  image,
  font,
  sameOriginRoutes,
}: {
  app: LegacyApp;
  freshShell: string;
  image: string;
  font: string;
  sameOriginRoutes: readonly ('image' | 'font')[];
}): void => {
  if (
    !excludesV8Prefix(freshShell) ||
    !/(?:"\/v8"!==[$\w]+\.pathname|[$\w]+\.pathname!=="\/v8")/.test(freshShell)
  ) {
    throw new Error(
      'the fresh-shell navigation route answers /v8 and /v8/ navigations with this app’s shell',
    );
  }
  for (const [name, source, what] of [
    ['image', image, 'images'],
    ['font', font, 'fonts'],
  ] as const) {
    if (!excludesV8Prefix(source)) {
      throw new Error(`the ${name} cache route caches ${app.label}’s ${what}`);
    }
    if (sameOriginRoutes.includes(name) && !requiresSameOrigin(source)) {
      throw new Error(
        `the ${name} cache route no longer requires a same-origin request`,
      );
    }
  }
};

/**
 * A route that must not answer anything under /v8/ by construction: its
 * matcher only accepts paths starting with `prefix` (such as `/interview/` or
 * `/assets/`), which no /v8/ path does. Checks the emitted matcher still
 * anchors on that prefix.
 */
export const assertAnchoredRoute = ({
  description,
  source,
  prefix,
}: {
  description: string;
  source: string;
  prefix: string;
}): void => {
  if (!/^\/[\w-]+\/$/.test(prefix) || prefix === '/v8/') {
    throw new Error(`${prefix} is not a top-level path prefix outside /v8/`);
  }
  // Not negated: `!url.pathname.startsWith(...)` would match everything else.
  const anchored = new RegExp(
    `(?<![!$\\w])[$\\w]+\\.pathname\\.startsWith\\("${prefix.replaceAll('/', '\\/')}"\\)`,
  );
  if (!anchored.test(source)) {
    throw new Error(
      `${description} no longer matches only paths under ${prefix}, so it may answer /v8/ requests`,
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
 * `/v8/*` must rewrite to the older major's shell before the catch-all hands
 * every path to this app's shell, and no rule may redirect a path to itself.
 *
 * In particular there is no `/v8 /v8/ 301`: Netlify's normalisation makes it
 * a loop whenever nothing exists at `/v8/` to shadow it (no older major is
 * bundled). Where `dist/v8/index.html` exists, Netlify's own directory
 * handling already takes `/v8` to it.
 */
export const assertLegacyRedirects = (app: LegacyApp, text: string): void => {
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
      `_redirects does not send /v8/* to ${app.label}’s shell before its catch-all`,
    );
  }
};

/**
 * dist/v8 holds the pinned build, under a cache prefix this app's reclaimer
 * leaves alone, with no hosting files of its own; or, when nothing is bundled,
 * does not exist.
 */
export const assertLegacyAppOutput = ({
  app,
  dist,
  resolution,
  foreignCachePrefixes,
}: {
  app: LegacyApp;
  dist: string;
  resolution: LegacyAppResolution;
  foreignCachePrefixes: readonly string[];
}): void => {
  const directory = join(dist, LEGACY_APP_DIST_DIR);
  if (!resolution.bundled) {
    if (existsSync(directory)) {
      throw new Error(
        `dist/${LEGACY_APP_DIST_DIR} exists, but this build bundles no ${app.label} (${resolution.reason})`,
      );
    }
    return;
  }
  if (!foreignCachePrefixes.includes(resolution.pin.cachePrefix)) {
    throw new Error(
      `the bundled ${app.label} caches under "${resolution.pin.cachePrefix}", which this app's cache reclaimer does not leave alone`,
    );
  }
  if (!existsSync(directory)) {
    throw new Error(
      `this build bundles ${app.appLabel} ${resolution.pin.version}, but dist/${LEGACY_APP_DIST_DIR} is missing`,
    );
  }
  validateLegacyAppDist(app, directory, resolution.pin);
  const leftovers = findLegacyAppHostingFiles(directory);
  if (leftovers.length > 0) {
    throw new Error(
      `dist/${LEGACY_APP_DIST_DIR} carries files it must not serve: ${leftovers.join(', ')}`,
    );
  }
};
