import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  findLegacyArchitectHostingFiles,
  legacyArchitectDefine,
  legacyArchitectPreviewRoute,
  loadLegacyArchitectV8,
  parseLegacyArchitectPins,
  resolveLegacyArchitectV8,
  validateLegacyArchitectDist,
} from '../legacy-architect.ts';
import {
  FIXTURE_VERSION,
  fixturePin,
  legacyDistFiles,
  writeFiles,
} from './legacyArchitectFixture';

const appRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('parseLegacyArchitectPins', () => {
  it('accepts the empty pin', () => {
    expect(parseLegacyArchitectPins({ v8: null })).toEqual({ v8: null });
  });

  it('accepts a pin, with the tag in the URL encoded or not', () => {
    const pin = fixturePin();
    expect(parseLegacyArchitectPins({ v8: pin })).toEqual({ v8: pin });
    const plainUrl = {
      ...pin,
      url: `https://github.com/complexdatacollective/network-canvas-monorepo/releases/download/@codaco/architect@${FIXTURE_VERSION}/architect-v8-dist.tgz`,
    };
    expect(parseLegacyArchitectPins({ v8: plainUrl }).v8).toEqual(plainUrl);
  });

  it('commits a pin file that parses', () => {
    const committed: unknown = JSON.parse(
      readFileSync(join(appRoot, 'legacy-architect.json'), 'utf8'),
    );
    expect(() => parseLegacyArchitectPins(committed)).not.toThrow();
  });

  it.each([
    ['not an object', []],
    ['no v8 key', {}],
    ['an unknown key', { v8: null, v9: null }],
    ['a v8 that is not an object', { v8: 'architect-v8-dist.tgz' }],
    ['a missing field', { v8: { ...fixturePin(), cachePrefix: undefined } }],
    ['an extra field', { v8: { ...fixturePin(), latest: 'true' } }],
    [
      'a version on another major',
      { v8: { ...fixturePin(), version: '9.0.0' } },
    ],
    ['a prerelease', { v8: { ...fixturePin(), version: '8.5.0-beta.1' } }],
    [
      'a URL on another repository',
      {
        v8: {
          ...fixturePin(),
          url: fixturePin().url.replace(
            'complexdatacollective',
            'someone-else',
          ),
        },
      },
    ],
    [
      'a URL for another release',
      {
        v8: {
          ...fixturePin(),
          url: fixturePin().url.replace('8.5.0', '8.4.0'),
        },
      },
    ],
    [
      'a URL for another asset',
      {
        v8: {
          ...fixturePin(),
          url: fixturePin().url.replace('architect-v8-dist.tgz', 'dist.tgz'),
        },
      },
    ],
    [
      'a plain-http URL',
      {
        v8: {
          ...fixturePin(),
          url: fixturePin().url.replace('https:', 'http:'),
        },
      },
    ],
    ['an uppercase sha256', { v8: fixturePin('A'.repeat(64)) }],
    ['a short sha256', { v8: fixturePin('a'.repeat(63)) }],
    [
      'another cache prefix',
      { v8: { ...fixturePin(), cachePrefix: 'architect-' } },
    ],
  ])('refuses %s', (_name, value) => {
    expect(() => parseLegacyArchitectPins(value)).toThrow(
      /legacy-architect\.json/,
    );
  });
});

describe('resolveLegacyArchitectV8', () => {
  const pinned = { v8: fixturePin() };
  const unpinned = { v8: null };

  it('bundles a pinned build', () => {
    expect(resolveLegacyArchitectV8({ pins: pinned, env: {} })).toEqual({
      bundled: true,
      pin: fixturePin(),
    });
  });

  it('bundles nothing while unpinned', () => {
    expect(resolveLegacyArchitectV8({ pins: unpinned, env: {} })).toEqual({
      bundled: false,
      pin: null,
      reason: 'unpinned',
    });
  });

  it('skips a pinned build when asked', () => {
    expect(
      resolveLegacyArchitectV8({
        pins: pinned,
        env: { ARCHITECT_SKIP_LEGACY_V8: 'true' },
      }),
    ).toEqual({ bundled: false, pin: null, reason: 'skipped' });
  });

  it('treats an empty or false flag as unset', () => {
    for (const value of ['', 'false', '0', 'FALSE']) {
      expect(
        resolveLegacyArchitectV8({
          pins: pinned,
          env: {
            ARCHITECT_SKIP_LEGACY_V8: value,
            ARCHITECT_REQUIRE_LEGACY_V8: value,
          },
        }).bundled,
      ).toBe(true);
    }
  });

  it('fails a build that requires Architect 8 while nothing is pinned', () => {
    expect(() =>
      resolveLegacyArchitectV8({
        pins: unpinned,
        env: { ARCHITECT_REQUIRE_LEGACY_V8: 'true' },
      }),
    ).toThrow(/pins no Architect 8 build/);
  });

  it('lets a required build go ahead once pinned', () => {
    expect(
      resolveLegacyArchitectV8({
        pins: pinned,
        env: { ARCHITECT_REQUIRE_LEGACY_V8: '1' },
      }).bundled,
    ).toBe(true);
  });

  it('refuses to skip a build that requires Architect 8', () => {
    expect(() =>
      resolveLegacyArchitectV8({
        pins: pinned,
        env: {
          ARCHITECT_REQUIRE_LEGACY_V8: 'true',
          ARCHITECT_SKIP_LEGACY_V8: 'true',
        },
      }),
    ).toThrow(/cannot skip/);
  });

  it('refuses a flag it cannot read', () => {
    expect(() =>
      resolveLegacyArchitectV8({
        pins: pinned,
        env: { ARCHITECT_REQUIRE_LEGACY_V8: 'yes' },
      }),
    ).toThrow(/ARCHITECT_REQUIRE_LEGACY_V8 must be/);
  });
});

describe('loadLegacyArchitectV8', () => {
  it('reads the committed pin file', () => {
    expect(() => loadLegacyArchitectV8(appRoot, {})).not.toThrow();
  });

  it('names the pin file it could not read', () => {
    expect(() => loadLegacyArchitectV8(tmpdir(), {})).toThrow(
      /could not read .*legacy-architect\.json/,
    );
  });
});

describe('legacyArchitectDefine', () => {
  it('tells the app the bundled version and its path', () => {
    expect(legacyArchitectDefine({ bundled: true, pin: fixturePin() })).toEqual(
      { version: FIXTURE_VERSION, path: '/v8/' },
    );
  });

  it('is null when nothing is bundled', () => {
    expect(
      legacyArchitectDefine({ bundled: false, pin: null, reason: 'skipped' }),
    ).toBeNull();
  });
});

describe('validateLegacyArchitectDist', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'legacy-architect-dist-'));
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('accepts the build the pin names', () => {
    writeFiles(directory, legacyDistFiles());
    expect(() =>
      validateLegacyArchitectDist(directory, fixturePin()),
    ).not.toThrow();
  });

  it.each([
    ['without its shell', { 'index.html': null }, /missing index\.html/],
    ['without its worker', { 'sw.js': null }, /missing sw\.js/],
    [
      'without dist-info.json',
      { 'dist-info.json': null },
      /missing dist-info\.json/,
    ],
    ['with unreadable dist-info.json', { 'dist-info.json': '{' }, /unreadable/],
    [
      'labelled as another version',
      {
        'dist-info.json': JSON.stringify({
          ...JSON.parse(legacyDistFiles()['dist-info.json'] ?? ''),
          version: '8.4.0',
        }),
      },
      /version "8\.4\.0"/,
    ],
    [
      'labelled with another base',
      {
        'dist-info.json': JSON.stringify({
          ...JSON.parse(legacyDistFiles()['dist-info.json'] ?? ''),
          base: '/',
        }),
      },
      /base "\/"/,
    ],
    [
      'labelled with no commit',
      {
        'dist-info.json': JSON.stringify({
          ...JSON.parse(legacyDistFiles()['dist-info.json'] ?? ''),
          commit: 'HEAD',
        }),
      },
      /full commit/,
    ],
    [
      'precaching under the root prefix',
      {
        'sw.js':
          'self.workbox.core.setCacheNameDetails({prefix:"architect-8.5.0-turbo-0123456789abcdef"});',
      },
      /precaches under "architect-8\.5\.0/,
    ],
    [
      'built for the root',
      {
        'index.html':
          '<!doctype html><script type="module" src="/assets/main-abc.js"></script>',
      },
      /index\.html does not load its assets from \/v8\/assets\//,
    ],
    [
      'loading a preview asset from the root',
      {
        'preview/index.html':
          '<script src="/v8/assets/preview-abc.js"></script><link href="/assets/x.css">',
      },
      /preview\/index\.html loads assets from \/assets\//,
    ],
    [
      'with a root manifest scope',
      {
        'manifest.webmanifest': JSON.stringify({
          start_url: '/v8/',
          scope: '/',
        }),
      },
      /manifest scope is "\/"/,
    ],
  ])('refuses a build %s', (_name, overrides, message) => {
    writeFiles(directory, legacyDistFiles(overrides));
    expect(() => validateLegacyArchitectDist(directory, fixturePin())).toThrow(
      message,
    );
  });
});

describe('findLegacyArchitectHostingFiles', () => {
  it('finds hosting rules at the root and source maps anywhere', () => {
    const directory = mkdtempSync(join(tmpdir(), 'legacy-architect-hosting-'));
    try {
      writeFiles(directory, {
        ...legacyDistFiles(),
        '_headers': '/*\n  X-Test: 1\n',
        '_redirects': '/* /index.html 200\n',
        'assets/main-abc.js.map': '{}',
      });
      expect(findLegacyArchitectHostingFiles(directory).toSorted()).toEqual([
        '_headers',
        '_redirects',
        join('assets', 'main-abc.js.map'),
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('legacyArchitectPreviewRoute', () => {
  const files = new Set([
    'index.html',
    'assets/main-abc.js',
    'preview/index.html',
  ]);
  const route = (pathname: string) =>
    legacyArchitectPreviewRoute(pathname, (file) => files.has(file));

  it('leaves this app’s own paths alone', () => {
    expect(route('/')).toBeNull();
    expect(route('/protocol/abc')).toBeNull();
    expect(route('/v80/')).toBeNull();
  });

  it('redirects /v8 to /v8/', () => {
    expect(route('/v8')).toEqual({ redirect: '/v8/' });
  });

  it('serves existing files and directory indexes', () => {
    expect(route('/v8/assets/main-abc.js')).toEqual({ serve: true });
    expect(route('/v8/')).toEqual({ rewrite: '/v8/index.html' });
    expect(route('/v8/preview/')).toEqual({
      rewrite: '/v8/preview/index.html',
    });
  });

  it('gives every other path Architect 8’s shell', () => {
    expect(route('/v8/protocol/abc/stages')).toEqual({
      rewrite: '/v8/index.html',
    });
    expect(route('/v8/assets/')).toEqual({ rewrite: '/v8/index.html' });
    expect(route('/v8/../index.html')).toEqual({ rewrite: '/v8/index.html' });
  });
});
