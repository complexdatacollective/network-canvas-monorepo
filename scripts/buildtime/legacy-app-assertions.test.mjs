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
  assertLegacySameOriginFraming,
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
// Route registrations as vite-plugin-pwa emits them into dist/sw.js, minified,
// copied from a build of each app's vite.config.ts. Architect's image route
// matches every origin; Interviewer's matches only its own.
const APP_ROUTES = {
  architect: {
    freshShell:
      'e.registerRoute(({request:e,sameOrigin:s,url:t})=>s&&"navigate"===e.mode&&!t.pathname.startsWith("/preview/")&&"/v8"!==t.pathname&&!t.pathname.startsWith("/v8/"),new e.NetworkOnly({plugins:[]}),"GET")',
    images:
      'e.registerRoute(({url:s})=>!s.pathname.startsWith("/v8/")&&/\\.(?:png|jpg|jpeg|svg|webp|gif)$/i.test(s.pathname)&&!["/pwa-64x64.png"].includes(s.pathname),new e.CacheFirst({cacheName:"architect-images"}),"GET")',
    fonts:
      'e.registerRoute(({sameOrigin:e,url:s})=>e&&!s.pathname.startsWith("/v8/")&&/\\.(?:woff2?|ttf|otf|eot)$/i.test(s.pathname),new e.CacheFirst({cacheName:"architect-fonts"}),"GET")',
    sameOriginRoutes: ['font'],
  },
  interviewer: {
    freshShell:
      'e.registerRoute(({request:e,sameOrigin:s,url:t})=>s&&"navigate"===e.mode&&!t.pathname.startsWith("/interview/")&&"/v8"!==t.pathname&&!t.pathname.startsWith("/v8/"),new e.NetworkOnly({plugins:[]}),"GET")',
    images:
      'e.registerRoute(({sameOrigin:e,url:s})=>e&&!s.pathname.startsWith("/v8/")&&/\\.(?:png|jpg|jpeg|svg|webp|gif)$/i.test(s.pathname)&&!["/pwa-64x64.png"].includes(s.pathname),new e.CacheFirst({cacheName:"interviewer-images"}),"GET")',
    fonts:
      'e.registerRoute(({sameOrigin:e,url:s})=>e&&!s.pathname.startsWith("/v8/")&&/\\.(?:woff2?|ttf|otf|eot)$/i.test(s.pathname),new e.CacheFirst({cacheName:"interviewer-fonts"}),"GET")',
    sameOriginRoutes: ['image', 'font'],
  },
};

const APPS = Object.keys(APP_ROUTES);

// Drops the clause that excludes /v8/ from an image or font route.
const withoutV8Exclusion = (route) =>
  route
    .replace('&&!s.pathname.startsWith("/v8/")', '')
    .replace('!s.pathname.startsWith("/v8/")&&', '');

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
    const { freshShell, images } = APP_ROUTES.interviewer;
    expect(findLegacyPrecacheEntries(`${freshShell},${images}`)).toEqual([]);
  });
});

describe.each(APPS)('%s routes', (name) => {
  const app = legacyApp(name);
  const {
    freshShell: FRESH_SHELL,
    images: IMAGES,
    fonts: FONTS,
    sameOriginRoutes: SAME_ORIGIN_ROUTES,
  } = APP_ROUTES[name];

  const routes = (freshShell, images, fonts) => {
    const sw = `${freshShell},${images},${fonts}`;
    return {
      freshShell: routeMatcherAt(sw, sw.indexOf('"navigate"===e.mode')),
      image: routeMatcherAt(sw, sw.indexOf(`cacheName:"${name}-images"`)),
      font: routeMatcherAt(sw, sw.indexOf(`cacheName:"${name}-fonts"`)),
    };
  };

  const assertRoutes = (
    freshShell,
    images,
    fonts,
    sameOriginRoutes = SAME_ORIGIN_ROUTES,
  ) =>
    assertLegacyRouteExclusions({
      app,
      ...routes(freshShell, images, fonts),
      sameOriginRoutes,
    });

  describe('routeMatcherAt', () => {
    it('cuts out one route’s matcher function', () => {
      const { freshShell, image, font } = routes(FRESH_SHELL, IMAGES, FONTS);
      expect(freshShell).toMatch(/^registerRoute\(\(\{request:e/);
      expect(freshShell).not.toContain('NetworkOnly');
      expect(image).toMatch(/^registerRoute\(\(\{[^}]*url:s\}\)/);
      expect(image).not.toContain('cacheName');
      expect(font).toMatch(/^registerRoute\(\(\{sameOrigin:e/);
    });
  });

  describe('assertLegacyRouteExclusions', () => {
    it(`accepts routes that leave /v8/ to ${app.label}’s worker`, () => {
      expect(() => assertRoutes(FRESH_SHELL, IMAGES, FONTS)).not.toThrow();
    });

    it('refuses a fresh-shell route that answers /v8/ navigations', () => {
      const answersV8 = FRESH_SHELL.replace(
        '&&!t.pathname.startsWith("/v8/")',
        '',
      );
      expect(() => assertRoutes(answersV8, IMAGES, FONTS)).toThrow(
        /fresh-shell/,
      );
    });

    it('refuses a fresh-shell route that answers a bare /v8 navigation', () => {
      const answersBareV8 = FRESH_SHELL.replace('&&"/v8"!==t.pathname', '');
      expect(() => assertRoutes(answersBareV8, IMAGES, FONTS)).toThrow(
        /fresh-shell/,
      );
    });

    it(`refuses an image route that caches ${app.label}’s images`, () => {
      const cachesV8 = withoutV8Exclusion(IMAGES);
      expect(cachesV8).not.toBe(IMAGES);
      expect(() => assertRoutes(FRESH_SHELL, cachesV8, FONTS)).toThrow(
        new RegExp(`image cache route caches ${app.label}’s images`),
      );
    });

    it(`refuses a font route that caches ${app.label}’s fonts`, () => {
      const cachesV8 = withoutV8Exclusion(FONTS);
      expect(cachesV8).not.toBe(FONTS);
      expect(() => assertRoutes(FRESH_SHELL, IMAGES, cachesV8)).toThrow(
        new RegExp(`font cache route caches ${app.label}’s fonts`),
      );
    });

    it('refuses a font route that matches other origins', () => {
      const anyOriginFonts = FONTS.replace(
        '({sameOrigin:e,url:s})=>e&&',
        '({sameOrigin:e,url:s})=>',
      );
      expect(() => assertRoutes(FRESH_SHELL, IMAGES, anyOriginFonts)).toThrow(
        /font cache route no longer requires a same-origin request/,
      );
    });

    it.runIf(SAME_ORIGIN_ROUTES.includes('image'))(
      'refuses an image route that matches other origins',
      () => {
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
      },
    );
  });
});

const check = (source, prefix = '/interview/') =>
  assertAnchoredRoute({ description: 'the route', source, prefix });

describe('assertAnchoredRoute', () => {
  const INTERVIEW =
    'e.registerRoute(({request:e,sameOrigin:s,url:t})=>s&&"navigate"===e.mode&&t.pathname.startsWith("/interview/"),new e.CacheOnly({})';

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

describe.each(APPS)('%s hosting and output', (name) => {
  const app = legacyApp(name);

  const redirects = (text) => assertLegacyRedirects(app, text);

  describe('assertLegacyRedirects', () => {
    it(`accepts the committed apps/${name}/public/_redirects`, () => {
      const committed = readFileSync(
        join(repositoryRoot, 'apps', name, 'public/_redirects'),
        'utf8',
      );
      expect(() => redirects(committed)).not.toThrow();
    });

    it('refuses a /v8/ rule that comes after the catch-all', () => {
      expect(() =>
        redirects('/*  /index.html  200\n/v8/*  /v8/index.html  200\n'),
      ).toThrow(new RegExp(`/v8/\\* to ${app.label}`));
    });

    it('refuses a missing rule', () => {
      expect(() => redirects('/*  /index.html  200\n')).toThrow(
        new RegExp(`/v8/\\* to ${app.label}`),
      );
      expect(() => redirects('/v8/*  /v8/index.html  200\n')).toThrow(
        /no "\/\* \/index\.html 200" rule/,
      );
    });

    it('refuses a /v8/ rule that redirects instead of rewriting', () => {
      expect(() =>
        redirects('/v8/*  /v8/index.html  302\n/*  /index.html  200\n'),
      ).toThrow(new RegExp(`/v8/\\* to ${app.label}`));
    });

    // Netlify matches `/v8` and `/v8/` alike, so with nothing at /v8/ to
    // shadow it (no older major bundled) this rule answers its own target.
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
    const foreignCachePrefixes = [app.cachePrefix];
    const output = (resolution, prefixes = foreignCachePrefixes) =>
      assertLegacyAppOutput({
        app,
        dist,
        resolution,
        foreignCachePrefixes: prefixes,
      });
    const pinned = () => ({ bundled: true, pin: fixturePin(app) });

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
      writeFiles(join(dist, 'v8'), legacyDistFiles(app));
      expect(() =>
        output({ bundled: false, pin: null, reason: 'skipped' }),
      ).toThrow(new RegExp(`bundles no ${app.label} \\(skipped\\)`));
    });

    it('accepts the pinned build in dist/v8', () => {
      writeFiles(join(dist, 'v8'), legacyDistFiles(app));
      expect(() => output(pinned())).not.toThrow();
    });

    it('refuses a pinned build that is missing', () => {
      expect(() => output(pinned())).toThrow(
        new RegExp(`bundles ${app.appLabel} 8\\.5\\.0, but dist/v8 is missing`),
      );
    });

    it('refuses a pinned build whose caches this app’s reclaimer would delete', () => {
      writeFiles(join(dist, 'v8'), legacyDistFiles(app));
      expect(() => output(pinned(), [])).toThrow(
        /reclaimer does not leave alone/,
      );
    });

    it('refuses a dist/v8 that is not the pinned build', () => {
      writeFiles(
        join(dist, 'v8'),
        legacyDistFiles(app, {
          'manifest.webmanifest': '{"start_url":"/","scope":"/"}',
        }),
      );
      expect(() => output(pinned())).toThrow(/manifest start_url/);
    });

    it('refuses a dist/v8 that still carries hosting files or maps', () => {
      writeFiles(join(dist, 'v8'), {
        ...legacyDistFiles(app),
        '_redirects': '/* /index.html 200\n',
        'assets/main-abc.js.map': '{}',
      });
      expect(() => output(pinned())).toThrow(
        /must not serve: _redirects, assets\/main-abc\.js\.map/,
      );
    });
  });
});

describe('assertLegacySameOriginFraming', () => {
  const NO_STORE = '  Cache-Control: no-store\n';

  it('accepts the committed apps/interviewer/public/_headers', () => {
    const committed = readFileSync(
      join(repositoryRoot, 'apps/interviewer/public/_headers'),
      'utf8',
    );
    expect(() => assertLegacySameOriginFraming(committed)).not.toThrow();
  });

  it('accepts a /* rule that limits every path to this origin', () => {
    expect(() =>
      assertLegacySameOriginFraming(
        "/*\n  Content-Security-Policy: frame-ancestors 'self'\n  X-Frame-Options: SAMEORIGIN\n",
      ),
    ).not.toThrow();
  });

  it('refuses a deploy that says nothing about framing /v8/', () => {
    expect(() =>
      assertLegacySameOriginFraming(`/*\n${NO_STORE}/v8/\n${NO_STORE}`),
    ).toThrow(/no Content-Security-Policy frame-ancestors for \/v8\//);
  });

  it('refuses any framing beyond this origin', () => {
    for (const ancestors of [
      "'self' https://elsewhere.example",
      '*',
      "'none'",
    ]) {
      expect(() =>
        assertLegacySameOriginFraming(
          `/v8/*\n  Content-Security-Policy: frame-ancestors ${ancestors}\n`,
        ),
      ).toThrow(/must be exactly 'self'/);
    }
  });

  it('refuses another matching rule whose policy would block the frame', () => {
    expect(() =>
      assertLegacySameOriginFraming(
        "/*\n  Content-Security-Policy: frame-ancestors 'none'\n/v8/*\n  Content-Security-Policy: frame-ancestors 'self'\n",
      ),
    ).toThrow(/rule \/\* sends/);
  });

  it('refuses X-Frame-Options: DENY on a /v8/ path', () => {
    expect(() =>
      assertLegacySameOriginFraming(
        "/v8/*\n  Content-Security-Policy: frame-ancestors 'self'\n/v8/index.html\n  X-Frame-Options: DENY\n",
      ),
    ).toThrow(/X-Frame-Options: DENY for \/v8\/index\.html/);
  });
});
