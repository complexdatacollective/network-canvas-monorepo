import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertLegacyArchitectOutput,
  assertLegacyRedirects,
  assertLegacyRouteExclusions,
  findLegacyPrecacheEntries,
  routeMatcherAt,
} from '../legacy-architect-assertions.ts';
import {
  fixturePin,
  legacyDistFiles,
  writeFiles,
} from './legacyArchitectFixture';

// Route registrations as vite-plugin-pwa emits them into dist/sw.js, minified,
// copied from a build of vite.config.ts.
const FRESH_SHELL =
  'e.registerRoute(({request:e,sameOrigin:s,url:l})=>s&&"navigate"===e.mode&&!l.pathname.startsWith("/preview/")&&"/v8"!==l.pathname&&!l.pathname.startsWith("/v8/"),new e.NetworkOnly({plugins:[]}),"GET")';
const IMAGES =
  'e.registerRoute(({url:e})=>!e.pathname.startsWith("/v8/")&&/\\.(?:png|jpg|jpeg|svg|webp|gif)$/i.test(e.pathname)&&!["/pwa-64x64.png"].includes(e.pathname),new e.CacheFirst({cacheName:"architect-images"}),"GET")';
const FONTS =
  'e.registerRoute(({sameOrigin:e,url:s})=>e&&!s.pathname.startsWith("/v8/")&&/\\.(?:woff2?|ttf|otf|eot)$/i.test(s.pathname),new e.CacheFirst({cacheName:"architect-fonts"}),"GET")';

const routes = (freshShell: string, images: string, fonts: string) => {
  const sw = `${freshShell},${images},${fonts}`;
  return {
    freshShell: routeMatcherAt(
      sw,
      sw.indexOf('!l.pathname.startsWith("/preview/")'),
    ),
    image: routeMatcherAt(sw, sw.indexOf('cacheName:"architect-images"')),
    font: routeMatcherAt(sw, sw.indexOf('cacheName:"architect-fonts"')),
  };
};

describe('findLegacyPrecacheEntries', () => {
  it('finds Architect 8 files in this app’s precache manifest', () => {
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
    expect(image).toMatch(/^registerRoute\(\(\{url:e\}\)/);
    expect(image).not.toContain('cacheName');
    expect(font).toMatch(/^registerRoute\(\(\{sameOrigin:e/);
  });
});

describe('assertLegacyRouteExclusions', () => {
  it('accepts routes that leave /v8/ to Architect 8’s worker', () => {
    expect(() =>
      assertLegacyRouteExclusions(routes(FRESH_SHELL, IMAGES, FONTS)),
    ).not.toThrow();
  });

  it('refuses a fresh-shell route that answers /v8/ navigations', () => {
    const answersV8 = FRESH_SHELL.replace(
      '&&!l.pathname.startsWith("/v8/")',
      '',
    );
    expect(() =>
      assertLegacyRouteExclusions(routes(answersV8, IMAGES, FONTS)),
    ).toThrow(/fresh-shell/);
  });

  it('refuses a fresh-shell route that answers a bare /v8 navigation', () => {
    const answersBareV8 = FRESH_SHELL.replace('&&"/v8"!==l.pathname', '');
    expect(() =>
      assertLegacyRouteExclusions(routes(answersBareV8, IMAGES, FONTS)),
    ).toThrow(/fresh-shell/);
  });

  it('refuses an image route that caches Architect 8’s images', () => {
    const cachesV8 = IMAGES.replace('!e.pathname.startsWith("/v8/")&&', '');
    expect(() =>
      assertLegacyRouteExclusions(routes(FRESH_SHELL, cachesV8, FONTS)),
    ).toThrow(/image cache route/);
  });

  it('refuses a font route that caches Architect 8’s fonts', () => {
    const cachesV8 = FONTS.replace('&&!s.pathname.startsWith("/v8/")', '');
    expect(() =>
      assertLegacyRouteExclusions(routes(FRESH_SHELL, IMAGES, cachesV8)),
    ).toThrow(/font cache route/);
  });

  it('refuses a font route that matches other origins', () => {
    const anyOrigin = FONTS.replace(
      '({sameOrigin:e,url:s})=>e&&',
      '({sameOrigin:e,url:s})=>',
    );
    expect(() =>
      assertLegacyRouteExclusions(routes(FRESH_SHELL, IMAGES, anyOrigin)),
    ).toThrow(/same-origin/);
  });
});

describe('assertLegacyRedirects', () => {
  const committed = readFileSync(
    fileURLToPath(new URL('../../public/_redirects', import.meta.url)),
    'utf8',
  );

  it('accepts the committed _redirects', () => {
    expect(() => assertLegacyRedirects(committed)).not.toThrow();
  });

  it('refuses rules that come after the catch-all', () => {
    expect(() =>
      assertLegacyRedirects(
        '/*  /index.html  200\n/v8  /v8/  301\n/v8/*  /v8/index.html  200\n',
      ),
    ).toThrow(/\/v8 to \/v8\//);
    expect(() =>
      assertLegacyRedirects(
        '/v8  /v8/  301\n/*  /index.html  200\n/v8/*  /v8/index.html  200\n',
      ),
    ).toThrow(/\/v8\/\* to Architect 8/);
  });

  it('refuses a missing rule', () => {
    expect(() => assertLegacyRedirects('/*  /index.html  200\n')).toThrow(
      /\/v8 to \/v8\//,
    );
    expect(() =>
      assertLegacyRedirects('/v8  /v8/  301\n/v8/*  /v8/index.html  200\n'),
    ).toThrow(/no "\/\* \/index\.html 200" rule/);
  });

  it('refuses a /v8/ rule that redirects instead of rewriting', () => {
    expect(() =>
      assertLegacyRedirects(
        '/v8  /v8/  301\n/v8/*  /v8/index.html  302\n/*  /index.html  200\n',
      ),
    ).toThrow(/\/v8\/\* to Architect 8/);
  });
});

describe('assertLegacyArchitectOutput', () => {
  let dist: string;
  const foreignCachePrefixes = ['architect-v8-'];

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'legacy-architect-output-'));
  });
  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it('accepts a build without Architect 8 and without dist/v8', () => {
    expect(() =>
      assertLegacyArchitectOutput({
        dist,
        resolution: { bundled: false, pin: null, reason: 'unpinned' },
        foreignCachePrefixes,
      }),
    ).not.toThrow();
  });

  it('refuses a dist/v8 the build did not bundle', () => {
    writeFiles(join(dist, 'v8'), legacyDistFiles());
    expect(() =>
      assertLegacyArchitectOutput({
        dist,
        resolution: { bundled: false, pin: null, reason: 'skipped' },
        foreignCachePrefixes,
      }),
    ).toThrow(/bundles no Architect 8 \(skipped\)/);
  });

  it('accepts the pinned build in dist/v8', () => {
    writeFiles(join(dist, 'v8'), legacyDistFiles());
    expect(() =>
      assertLegacyArchitectOutput({
        dist,
        resolution: { bundled: true, pin: fixturePin() },
        foreignCachePrefixes,
      }),
    ).not.toThrow();
  });

  it('refuses a pinned build that is missing', () => {
    expect(() =>
      assertLegacyArchitectOutput({
        dist,
        resolution: { bundled: true, pin: fixturePin() },
        foreignCachePrefixes,
      }),
    ).toThrow(/dist\/v8 is missing/);
  });

  it('refuses a pinned build whose caches this app’s reclaimer would delete', () => {
    writeFiles(join(dist, 'v8'), legacyDistFiles());
    expect(() =>
      assertLegacyArchitectOutput({
        dist,
        resolution: { bundled: true, pin: fixturePin() },
        foreignCachePrefixes: [],
      }),
    ).toThrow(/reclaimer does not leave alone/);
  });

  it('refuses a dist/v8 that is not the pinned build', () => {
    writeFiles(
      join(dist, 'v8'),
      legacyDistFiles({
        'manifest.webmanifest': '{"start_url":"/","scope":"/"}',
      }),
    );
    expect(() =>
      assertLegacyArchitectOutput({
        dist,
        resolution: { bundled: true, pin: fixturePin() },
        foreignCachePrefixes,
      }),
    ).toThrow(/manifest start_url/);
  });

  it('refuses a dist/v8 that still carries hosting files or maps', () => {
    writeFiles(join(dist, 'v8'), {
      ...legacyDistFiles(),
      '_redirects': '/* /index.html 200\n',
      'assets/main-abc.js.map': '{}',
    });
    expect(() =>
      assertLegacyArchitectOutput({
        dist,
        resolution: { bundled: true, pin: fixturePin() },
        foreignCachePrefixes,
      }),
    ).toThrow(/must not serve: _redirects, assets\/main-abc\.js\.map/);
  });
});
