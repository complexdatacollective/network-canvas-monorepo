import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bundleLegacyApp } from './bundle-legacy-app.mjs';
import {
  fixturePin as appFixturePin,
  legacyDistFiles as appLegacyDistFiles,
  packTarball,
  writeFiles,
} from './legacy-app-fixture.mjs';
import { legacyApp } from './legacy-app.ts';

// Every app that serves its older major at /v8/.
const APPS = ['architect', 'interviewer'];

const okResponse = (bytes) =>
  new Response(new Uint8Array(bytes), { status: 200 });

const byName = (a, b) => a.localeCompare(b);

describe.each(APPS)('bundleLegacyApp for %s', (name) => {
  const app = legacyApp(name);
  const fixturePin = (sha) => appFixturePin(app, sha);
  const legacyDistFiles = (overrides) => appLegacyDistFiles(app, overrides);
  const tarballEnv = (path) => ({ [app.env.tarball]: path });
  const tarballVariable = app.env.tarball;

  let root;
  let appRoot;
  let dist;
  let tarball;
  let sha256;

  const cacheDir = () =>
    join(appRoot, 'node_modules', '.cache', app.cacheDirName);

  const packFixture = (files = legacyDistFiles(), extraTarArgs = []) => {
    const source = mkdtempSync(join(root, 'source-'));
    writeFiles(source, files);
    return packTarball(source, tarball, extraTarArgs);
  };

  const run = (options = {}) =>
    bundleLegacyApp({
      app,
      appRoot,
      dist,
      pin: fixturePin(sha256),
      env: tarballEnv(tarball),
      fetchImpl: vi.fn(),
      retryDelayMs: 0,
      log: () => {},
      ...options,
    });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bundle-legacy-app-'));
    appRoot = join(root, 'app');
    dist = join(appRoot, 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'index.html'), `${app.appLabel} 9`);
    tarball = join(root, app.tarballName);
    sha256 = packFixture({
      ...legacyDistFiles(),
      // What the tarball must not bring along into the deploy.
      '_headers': '/*\n  X-Test: 1\n',
      '_redirects': '/* /index.html 200\n',
      'assets/main-abc.js.map': '{}',
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('does nothing when nothing is pinned', async () => {
    await expect(run({ pin: null })).resolves.toBeNull();
    expect(existsSync(join(dist, 'v8'))).toBe(false);
  });

  it('installs a local tarball into dist/v8 without its hosting files or maps', async () => {
    await expect(run()).resolves.toBe(join(dist, 'v8'));

    const installed = readdirSync(join(dist, 'v8'), { recursive: true })
      .map(String)
      .toSorted(byName);
    // Every file the build has, and each directory on the way to one.
    const expected = new Set(
      Object.keys(legacyDistFiles()).flatMap((file) => {
        const parts = file.split('/');
        return parts.map((_part, index) => join(...parts.slice(0, index + 1)));
      }),
    );
    expect(installed).toEqual([...expected].toSorted(byName));
    // This app's own output is untouched, and no extraction directory is left.
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toBe(
      `${app.appLabel} 9`,
    );
    expect(readdirSync(cacheDir())).toEqual([]);
  });

  it(`replaces a ${app.label} already in dist`, async () => {
    writeFiles(join(dist, 'v8'), { 'stale.js': 'old' });
    await run();
    expect(existsSync(join(dist, 'v8', 'stale.js'))).toBe(false);
    expect(existsSync(join(dist, 'v8', 'index.html'))).toBe(true);
  });

  it('refuses a local tarball that does not match the pin', async () => {
    await expect(run({ pin: fixturePin('b'.repeat(64)) })).rejects.toThrow(
      new RegExp(`${tarballVariable} .* hashes to`),
    );
    expect(existsSync(join(dist, 'v8'))).toBe(false);
  });

  it('refuses a local tarball that does not exist', async () => {
    await expect(
      run({
        env: tarballEnv(join(root, 'missing.tgz')),
      }),
    ).rejects.toThrow(/does not exist/);
  });

  it('downloads the pinned tarball, retrying a failure, then reuses the cached copy', async () => {
    const bytes = readFileSync(tarball);
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(okResponse(bytes));

    await run({ env: {}, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledWith(
      fixturePin(sha256).url,
      expect.objectContaining({ redirect: 'follow' }),
    );
    expect(existsSync(join(cacheDir(), `${sha256}.tgz`))).toBe(true);
    expect(existsSync(join(dist, 'v8', 'index.html'))).toBe(true);

    rmSync(join(dist, 'v8'), { recursive: true });
    const offline = vi.fn();
    await run({ env: {}, fetchImpl: offline });
    expect(offline).not.toHaveBeenCalled();
    expect(existsSync(join(dist, 'v8', 'index.html'))).toBe(true);
  });

  it('discards a cached copy that no longer matches and downloads again', async () => {
    mkdirSync(cacheDir(), { recursive: true });
    writeFileSync(join(cacheDir(), `${sha256}.tgz`), 'corrupt');
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse(readFileSync(tarball)));
    await run({ env: {}, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(existsSync(join(dist, 'v8', 'index.html'))).toBe(true);
  });

  it('never retries into a download that hashes wrong', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        okResponse(new TextEncoder().encode('replaced asset')),
      );
    await expect(run({ env: {}, fetchImpl })).rejects.toThrow(
      /release asset was replaced, or the pin is wrong/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(existsSync(join(cacheDir(), `${sha256}.tgz`))).toBe(false);
  });

  it('gives up after its attempts and says how to build without the network', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(run({ env: {}, fetchImpl, attempts: 2 })).rejects.toThrow(
      new RegExp(`after 2 attempts .*${tarballVariable}`),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(existsSync(join(dist, 'v8'))).toBe(false);
  });

  it('refuses a build that is not the pinned one', async () => {
    sha256 = packFixture(
      legacyDistFiles({
        'sw.js': `self.workbox.core.setCacheNameDetails({prefix:"${name}-8.5.0-turbo-0123456789abcdef"});`,
      }),
    );
    await expect(run()).rejects.toThrow(
      new RegExp(`precaches under "${name}-8\\.5\\.0`),
    );
    expect(existsSync(join(dist, 'v8'))).toBe(false);
    expect(readdirSync(cacheDir())).toEqual([]);
  });

  it('refuses an archive holding a link', async () => {
    const source = mkdtempSync(join(root, 'source-'));
    writeFiles(source, legacyDistFiles());
    symlinkSync('/etc/passwd', join(source, 'assets', 'linked.js'));
    sha256 = packTarball(source, tarball);
    await expect(run()).rejects.toThrow(/not a file or directory/);
    expect(existsSync(join(dist, 'v8'))).toBe(false);
  });

  it('refuses an archive with an entry outside its root', async () => {
    sha256 = packFixture(legacyDistFiles(), [
      '--absolute-names',
      '--transform=s,^\\./sw\\.js$,../escaped.js,',
    ]);
    await expect(run()).rejects.toThrow(/unsafe entry: \.\.\/escaped\.js/);
    expect(existsSync(join(cacheDir(), 'escaped.js'))).toBe(false);
    expect(existsSync(join(dist, 'v8'))).toBe(false);
  });
});
