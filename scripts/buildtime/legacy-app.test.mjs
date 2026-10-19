import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FIXTURE_VERSION,
  fixturePin,
  legacyDistFiles,
  writeFiles,
} from './legacy-app-fixture.mjs';
import {
  findLegacyAppHostingFiles,
  legacyApp,
  legacyAppDefine,
  legacyAppPreviewRoute,
  loadLegacyAppV8,
  parseLegacyAppPins,
  resolveLegacyAppV8,
  validateLegacyAppDist,
} from './legacy-app.ts';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

// Every app that serves its older major at /v8/.
const APPS = ['interviewer'];

describe('legacyApp', () => {
  it('derives every name Interviewer 8 is known by', () => {
    const app = legacyApp('interviewer');
    expect({ ...app, releaseTag: app.releaseTag('8.5.0') }).toEqual({
      name: 'interviewer',
      appLabel: 'Interviewer',
      label: 'Interviewer 8',
      pinFile: 'legacy-interviewer.json',
      tarballName: 'interviewer-v8-dist.tgz',
      cachePrefix: 'interviewer-v8-',
      htmlEntries: ['index.html'],
      defineName: '__INTERVIEWER_V8__',
      env: {
        require: 'INTERVIEWER_REQUIRE_LEGACY_V8',
        skip: 'INTERVIEWER_SKIP_LEGACY_V8',
        tarball: 'INTERVIEWER_LEGACY_V8_TARBALL',
      },
      cacheDirName: 'interviewer-legacy',
      releaseTag: '@codaco/interviewer@8.5.0',
    });
  });

  it('refuses an app that serves no older major', () => {
    expect(() => legacyApp('fresco')).toThrow(/serves no older major/);
  });
});

describe.each(APPS)('%s', (name) => {
  const app = legacyApp(name);
  const appRoot = join(repositoryRoot, 'apps', name);
  const pinFilePattern = new RegExp(app.pinFile.replaceAll('.', '\\.'));
  const pin = (sha256) => fixturePin(app, sha256);

  describe('parseLegacyAppPins', () => {
    it('accepts the empty pin', () => {
      expect(parseLegacyAppPins(app, { v8: null })).toEqual({ v8: null });
    });

    it('accepts a pin, with the tag in the URL encoded or not', () => {
      expect(parseLegacyAppPins(app, { v8: pin() })).toEqual({ v8: pin() });
      const plainUrl = {
        ...pin(),
        url: `https://github.com/complexdatacollective/network-canvas-monorepo/releases/download/@codaco/${name}@${FIXTURE_VERSION}/${app.tarballName}`,
      };
      expect(parseLegacyAppPins(app, { v8: plainUrl }).v8).toEqual(plainUrl);
    });

    it('commits a pin file that parses', () => {
      const committed = JSON.parse(
        readFileSync(join(appRoot, app.pinFile), 'utf8'),
      );
      expect(() => parseLegacyAppPins(app, committed)).not.toThrow();
    });

    it.each([
      ['not an object', []],
      ['no v8 key', {}],
      ['an unknown key', { v8: null, v9: null }],
      ['a v8 that is not an object', { v8: 'dist.tgz' }],
      ['a missing field', { v8: { ...pin(), cachePrefix: undefined } }],
      ['an extra field', { v8: { ...pin(), latest: 'true' } }],
      ['a version on another major', { v8: { ...pin(), version: '9.0.0' } }],
      ['a prerelease', { v8: { ...pin(), version: '8.5.0-beta.1' } }],
      [
        'a URL on another repository',
        {
          v8: {
            ...pin(),
            url: pin().url.replace('complexdatacollective', 'someone-else'),
          },
        },
      ],
      [
        'a URL for another release',
        { v8: { ...pin(), url: pin().url.replace('8.5.0', '8.4.0') } },
      ],
      [
        'a URL for another app’s release',
        {
          v8: {
            ...pin(),
            url: pin().url.replace(`%2F${name}%40`, '%2Ffresco%40'),
          },
        },
      ],
      [
        'a URL for another asset',
        { v8: { ...pin(), url: pin().url.replace(app.tarballName, 'x.tgz') } },
      ],
      [
        'a plain-http URL',
        { v8: { ...pin(), url: pin().url.replace('https:', 'http:') } },
      ],
      ['an uppercase sha256', { v8: pin('A'.repeat(64)) }],
      ['a short sha256', { v8: pin('a'.repeat(63)) }],
      [
        'the root build’s cache prefix',
        { v8: { ...pin(), cachePrefix: `${name}-` } },
      ],
    ])('refuses %s', (_case, value) => {
      expect(() => parseLegacyAppPins(app, value)).toThrow(pinFilePattern);
    });
  });

  describe('resolveLegacyAppV8', () => {
    const pinned = { v8: pin() };
    const unpinned = { v8: null };
    const resolve = (pins, env) => resolveLegacyAppV8({ app, pins, env });

    it('bundles a pinned build', () => {
      expect(resolve(pinned, {})).toEqual({ bundled: true, pin: pin() });
    });

    it('bundles nothing while unpinned', () => {
      expect(resolve(unpinned, {})).toEqual({
        bundled: false,
        pin: null,
        reason: 'unpinned',
      });
    });

    it('skips a pinned build when asked', () => {
      expect(resolve(pinned, { [app.env.skip]: 'true' })).toEqual({
        bundled: false,
        pin: null,
        reason: 'skipped',
      });
    });

    it('reads only its own app’s flags', () => {
      const otherSkip = app.env.skip.replace(/^[A-Z]+_/, 'FRESCO_');
      expect(resolve(pinned, { [otherSkip]: 'true' }).bundled).toBe(true);
    });

    it('treats an empty or false flag as unset', () => {
      for (const value of ['', 'false', '0', 'FALSE']) {
        expect(
          resolve(pinned, { [app.env.skip]: value, [app.env.require]: value })
            .bundled,
        ).toBe(true);
      }
    });

    it(`fails a build that requires ${app.label} while nothing is pinned`, () => {
      expect(() => resolve(unpinned, { [app.env.require]: 'true' })).toThrow(
        new RegExp(`pins no ${app.label} build`),
      );
    });

    it('lets a required build go ahead once pinned', () => {
      expect(resolve(pinned, { [app.env.require]: '1' }).bundled).toBe(true);
    });

    it(`refuses to skip a build that requires ${app.label}`, () => {
      expect(() =>
        resolve(pinned, {
          [app.env.require]: 'true',
          [app.env.skip]: 'true',
        }),
      ).toThrow(/cannot skip/);
    });

    it('refuses a flag it cannot read', () => {
      expect(() => resolve(pinned, { [app.env.require]: 'yes' })).toThrow(
        new RegExp(`${app.env.require} must be`),
      );
    });
  });

  describe('loadLegacyAppV8', () => {
    it('reads the committed pin file', () => {
      expect(() => loadLegacyAppV8(app, appRoot, {})).not.toThrow();
    });

    it('names the pin file it could not read', () => {
      expect(() => loadLegacyAppV8(app, tmpdir(), {})).toThrow(
        new RegExp(`could not read .*${pinFilePattern.source}`),
      );
    });
  });

  describe('validateLegacyAppDist', () => {
    let directory;
    const files = (overrides) => legacyDistFiles(app, overrides);
    const distInfo = (changes) =>
      JSON.stringify({
        ...JSON.parse(files()['dist-info.json'] ?? ''),
        ...changes,
      });

    beforeEach(() => {
      directory = mkdtempSync(join(tmpdir(), 'legacy-app-dist-'));
    });
    afterEach(() => {
      rmSync(directory, { recursive: true, force: true });
    });

    it('accepts the build the pin names', () => {
      writeFiles(directory, files());
      expect(() => validateLegacyAppDist(app, directory, pin())).not.toThrow();
    });

    it.each([
      ['without its shell', { 'index.html': null }, /missing index\.html/],
      ['without its worker', { 'sw.js': null }, /missing sw\.js/],
      [
        'without dist-info.json',
        { 'dist-info.json': null },
        /missing dist-info\.json/,
      ],
      [
        'with unreadable dist-info.json',
        { 'dist-info.json': '{' },
        /unreadable/,
      ],
      [
        'labelled as another version',
        { 'dist-info.json': distInfo({ version: '8.4.0' }) },
        /version "8\.4\.0"/,
      ],
      [
        'labelled as another app',
        { 'dist-info.json': distInfo({ tag: '@codaco/fresco@8.5.0' }) },
        /tag "@codaco\/fresco@8\.5\.0"/,
      ],
      [
        'labelled with another base',
        { 'dist-info.json': distInfo({ base: '/' }) },
        /base "\/"/,
      ],
      [
        'labelled with no commit',
        { 'dist-info.json': distInfo({ commit: 'HEAD' }) },
        /full commit/,
      ],
      [
        'precaching under the root prefix',
        {
          'sw.js': `self.workbox.core.setCacheNameDetails({prefix:"${name}-8.5.0-turbo-0123456789abcdef"});`,
        },
        new RegExp(`precaches under "${name}-8\\.5\\.0`),
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
        'loading an asset from the root',
        {
          'index.html':
            '<script src="/v8/assets/main-abc.js"></script><link href="/assets/x.css">',
        },
        /index\.html loads assets from \/assets\//,
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
    ])('refuses a build %s', (_case, overrides, message) => {
      writeFiles(directory, files(overrides));
      expect(() => validateLegacyAppDist(app, directory, pin())).toThrow(
        message,
      );
    });
  });
});

describe('legacyAppDefine', () => {
  const app = legacyApp('interviewer');

  it('tells the app the bundled version and its path', () => {
    expect(legacyAppDefine({ bundled: true, pin: fixturePin(app) })).toEqual({
      version: FIXTURE_VERSION,
      path: '/v8/',
    });
  });

  it('is null when nothing is bundled', () => {
    expect(
      legacyAppDefine({ bundled: false, pin: null, reason: 'skipped' }),
    ).toBeNull();
  });
});

describe('findLegacyAppHostingFiles', () => {
  it('finds hosting rules at the root and source maps anywhere', () => {
    const directory = mkdtempSync(join(tmpdir(), 'legacy-app-hosting-'));
    try {
      writeFiles(directory, {
        ...legacyDistFiles(legacyApp('interviewer')),
        '_headers': '/*\n  X-Test: 1\n',
        '_redirects': '/* /index.html 200\n',
        'assets/main-abc.js.map': '{}',
      });
      expect(findLegacyAppHostingFiles(directory).toSorted()).toEqual([
        '_headers',
        '_redirects',
        join('assets', 'main-abc.js.map'),
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('legacyAppPreviewRoute', () => {
  const files = new Set([
    'index.html',
    'assets/main-abc.js',
    'preview/index.html',
  ]);
  const route = (pathname) =>
    legacyAppPreviewRoute(pathname, (file) => files.has(file));

  it('leaves this app’s own paths alone', () => {
    expect(route('/')).toBeNull();
    expect(route('/interview/abc')).toBeNull();
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

  it('gives every other path the older major’s shell', () => {
    expect(route('/v8/interview/abc')).toEqual({ rewrite: '/v8/index.html' });
    expect(route('/v8/assets/')).toEqual({ rewrite: '/v8/index.html' });
    expect(route('/v8/../index.html')).toEqual({ rewrite: '/v8/index.html' });
  });
});
