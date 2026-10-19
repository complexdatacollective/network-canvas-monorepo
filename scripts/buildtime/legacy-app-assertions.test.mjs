import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertAnchoredRoute,
  assertLegacyAppOutput,
  assertLegacyRedirects,
  assertLegacyRouteExclusions,
  findLegacyPrecacheEntries,
  routeMatcherAt,
} from './legacy-app-assertions.ts';
import {
  fixturePin,
  legacyDistFiles,
  writeFiles,
} from './legacy-app-fixture.mjs';
import { legacyApp } from './legacy-app.ts';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const interviewer = legacyApp('interviewer');

// Route registrations as vite-plugin-pwa emits them into dist/sw.js, minified,
// copied from a build of apps/interviewer/vite.config.ts.
const FRESH_SHELL =
  'e.registerRoute(({request:e,sameOrigin:s,url:t})=>s&&"navigate"===e.mode&&!t.pathname.startsWith("/interview/")&&"/v8"!==t.pathname&&!t.pathname.startsWith("/v8/"),new e.NetworkOnly({plugins:[]}),"GET")';
const IMAGES =
  'e.registerRoute(({sameOrigin:e,url:s})=>e&&!s.pathname.startsWith("/v8/")&&/\\.(?:png|jpg|jpeg|svg|webp|gif)$/i.test(s.pathname)&&!["/pwa-64x64.png"].includes(s.pathname),new e.CacheFirst({cacheName:"interviewer-images"}),"GET")';
const FONTS =
  'e.registerRoute(({sameOrigin:e,url:s})=>e&&!s.pathname.startsWith("/v8/")&&/\\.(?:woff2?|ttf|otf|eot)$/i.test(s.pathname),new e.CacheFirst({cacheName:"interviewer-fonts"}),"GET")';

const routes = (freshShell, images, fonts) => {
  const sw = `${freshShell},${images},${fonts}`;
  return {
    freshShell: routeMatcherAt(sw, sw.indexOf('"navigate"===e.mode')),
    image: routeMatcherAt(sw, sw.indexOf('cacheName:"interviewer-images"')),
    font: routeMatcherAt(sw, sw.indexOf('cacheName:"interviewer-fonts"')),
  };
};

const assertRoutes = (
  freshShell,
  images,
  fonts,
  sameOriginRoutes = ['image', 'font'],
) =>
  assertLegacyRouteExclusions({
    app: interviewer,
    ...routes(freshShell, images, fonts),
    sameOriginRoutes,
  });

describe('findLegacyPrecacheEntries', () => {
  it('finds the older major’s files in this app’s precache manifest', () => {
    const sw =
      'e.precacheAndRoute([{url:"assets/main-abc.js",revision:null},{url:"v8/index.html",revision:"1"},{url:"/v8/sw.js",revision:"2"}],{})';
    expect(findLegacyPrecacheEntries(sw)).toEqual([
      'v8/index.html',
      '/v8/sw.js',
    ]);
  });

  it('ignores the route exclusions, which name /v8/ too', () => {
    expect(findLegacyPrecacheEntries(`${FRESH_SHELL},${IMAGES}`)).toEqual([]);
  });
});

describe('routeMatcherAt', () => {
  it('cuts out one route’s matcher function', () => {
    const { freshShell, image, font } = routes(FRESH_SHELL, IMAGES, FONTS);
    expect(freshShell).toMatch(/^registerRoute\(\(\{request:e/);
    expect(freshShell).not.toContain('NetworkOnly');
    expect(image).toMatch(/^registerRoute\(\(\{sameOrigin:e,url:s\}\)/);
    expect(image).not.toContain('cacheName');
    expect(font).toMatch(/^registerRoute\(\(\{sameOrigin:e/);
  });
});

describe('assertLegacyRouteExclusions', () => {
  it('accepts routes that leave /v8/ to the older major’s worker', () => {
    expect(() => assertRoutes(FRESH_SHELL, IMAGES, FONTS)).not.toThrow();
  });

  it('refuses a fresh-shell route that answers /v8/ navigations', () => {
    const answersV8 = FRESH_SHELL.replace(
      '&&!t.pathname.startsWith("/v8/")',
      '',
    );
    expect(() => assertRoutes(answersV8, IMAGES, FONTS)).toThrow(/fresh-shell/);
  });

  it('refuses a fresh-shell route that answers a bare /v8 navigation', () => {
    const answersBareV8 = FRESH_SHELL.replace('&&"/v8"!==t.pathname', '');
    expect(() => assertRoutes(answersBareV8, IMAGES, FONTS)).toThrow(
      /fresh-shell/,
    );
  });

  it('refuses an image route that caches the older major’s images', () => {
    const cachesV8 = IMAGES.replace('&&!s.pathname.startsWith("/v8/")', '');
    expect(() => assertRoutes(FRESH_SHELL, cachesV8, FONTS)).toThrow(
      /image cache route caches Interviewer 8’s images/,
    );
  });

  it('refuses a font route that caches the older major’s fonts', () => {
    const cachesV8 = FONTS.replace('&&!s.pathname.startsWith("/v8/")', '');
    expect(() => assertRoutes(FRESH_SHELL, IMAGES, cachesV8)).toThrow(
      /font cache route caches Interviewer 8’s fonts/,
    );
  });

  it('refuses a route that must be same-origin and matches other origins', () => {
    const anyOriginFonts = FONTS.replace(
      '({sameOrigin:e,url:s})=>e&&',
      '({sameOrigin:e,url:s})=>',
    );
    expect(() => assertRoutes(FRESH_SHELL, IMAGES, anyOriginFonts)).toThrow(
      /font cache route no longer requires a same-origin request/,
    );
    const anyOriginImages = IMAGES.replace(
      '({sameOrigin:e,url:s})=>e&&',
      '({url:s})=>',
    );
    expect(() => assertRoutes(FRESH_SHELL, anyOriginImages, FONTS)).toThrow(
      /image cache route no longer requires a same-origin request/,
    );
    // Only the routes named have to be same-origin.
    expect(() =>
      assertRoutes(FRESH_SHELL, anyOriginImages, FONTS, ['font']),
    ).not.toThrow();
  });
});

describe('assertAnchoredRoute', () => {
  const INTERVIEW =
    'e.registerRoute(({request:e,sameOrigin:s,url:t})=>s&&"navigate"===e.mode&&t.pathname.startsWith("/interview/"),new e.CacheOnly({})';
  const check = (source, prefix = '/interview/') =>
    assertAnchoredRoute({ description: 'the route', source, prefix });

  it('accepts a matcher that only takes paths under its prefix', () => {
    expect(() => check(INTERVIEW)).not.toThrow();
  });

  it('refuses a matcher that no longer anchors on its prefix', () => {
    expect(() =>
      check(INTERVIEW.replace('t.pathname.startsWith', 't.pathname.includes')),
    ).toThrow(/no longer matches only paths under \/interview\//);
    expect(() => check(INTERVIEW.replace('&&t.', '&&!t.'))).toThrow(
      /no longer matches only paths under/,
    );
  });

  it('refuses a prefix that is itself under /v8/ or not a path', () => {
    expect(() => check(INTERVIEW, '/v8/')).toThrow(/not a top-level path/);
    expect(() => check(INTERVIEW, 'interview')).toThrow(/not a top-level/);
  });
});

describe('assertLegacyRedirects', () => {
  const redirects = (text) => assertLegacyRedirects(interviewer, text);

  it('accepts the committed Interviewer _redirects', () => {
    const committed = readFileSync(
      join(repositoryRoot, 'apps/interviewer/public/_redirects'),
      'utf8',
    );
    expect(() => redirects(committed)).not.toThrow();
  });

  it('refuses a /v8/ rule that comes after the catch-all', () => {
    expect(() =>
      redirects('/*  /index.html  200\n/v8/*  /v8/index.html  200\n'),
    ).toThrow(/\/v8\/\* to Interviewer 8/);
  });

  it('refuses a missing rule', () => {
    expect(() => redirects('/*  /index.html  200\n')).toThrow(
      /\/v8\/\* to Interviewer 8/,
    );
    expect(() => redirects('/v8/*  /v8/index.html  200\n')).toThrow(
      /no "\/\* \/index\.html 200" rule/,
    );
  });

  it('refuses a /v8/ rule that redirects instead of rewriting', () => {
    expect(() =>
      redirects('/v8/*  /v8/index.html  302\n/*  /index.html  200\n'),
    ).toThrow(/\/v8\/\* to Interviewer 8/);
  });

  // Netlify matches `/v8` and `/v8/` alike, so with nothing at /v8/ to shadow
  // it (no Interviewer 8 bundled) this rule answers its own target.
  it.each(['/v8  /v8/  301', '/v8/  /v8  301', '/v8  /v8/  302!'])(
    'refuses a rule that redirects a path to itself (%s)',
    (rule) => {
      expect(() =>
        redirects(
          `${rule}\n/v8/*  /v8/index.html  200\n/*  /index.html  200\n`,
        ),
      ).toThrow(/redirects forever/);
    },
  );
});

describe('assertLegacyAppOutput', () => {
  let dist;
  const foreignCachePrefixes = ['interviewer-v8-'];
  const output = (resolution, prefixes = foreignCachePrefixes) =>
    assertLegacyAppOutput({
      app: interviewer,
      dist,
      resolution,
      foreignCachePrefixes: prefixes,
    });
  const pinned = () => ({ bundled: true, pin: fixturePin(interviewer) });

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'legacy-app-output-'));
  });
  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it('accepts a build without the older major and without dist/v8', () => {
    expect(() =>
      output({ bundled: false, pin: null, reason: 'unpinned' }),
    ).not.toThrow();
  });

  it('refuses a dist/v8 the build did not bundle', () => {
    writeFiles(join(dist, 'v8'), legacyDistFiles(interviewer));
    expect(() =>
      output({ bundled: false, pin: null, reason: 'skipped' }),
    ).toThrow(/bundles no Interviewer 8 \(skipped\)/);
  });

  it('accepts the pinned build in dist/v8', () => {
    writeFiles(join(dist, 'v8'), legacyDistFiles(interviewer));
    expect(() => output(pinned())).not.toThrow();
  });

  it('refuses a pinned build that is missing', () => {
    expect(() => output(pinned())).toThrow(
      /bundles Interviewer 8\.5\.0, but dist\/v8 is missing/,
    );
  });

  it('refuses a pinned build whose caches this app’s reclaimer would delete', () => {
    writeFiles(join(dist, 'v8'), legacyDistFiles(interviewer));
    expect(() => output(pinned(), [])).toThrow(
      /reclaimer does not leave alone/,
    );
  });

  it('refuses a dist/v8 that is not the pinned build', () => {
    writeFiles(
      join(dist, 'v8'),
      legacyDistFiles(interviewer, {
        'manifest.webmanifest': '{"start_url":"/","scope":"/"}',
      }),
    );
    expect(() => output(pinned())).toThrow(/manifest start_url/);
  });

  it('refuses a dist/v8 that still carries hosting files or maps', () => {
    writeFiles(join(dist, 'v8'), {
      ...legacyDistFiles(interviewer),
      '_redirects': '/* /index.html 200\n',
      'assets/main-abc.js.map': '{}',
    });
    expect(() => output(pinned())).toThrow(
      /must not serve: _redirects, assets\/main-abc\.js\.map/,
    );
  });
});
