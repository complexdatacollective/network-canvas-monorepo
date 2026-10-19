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

import { bundleLegacyArchitect } from '../bundle-legacy-architect.mjs';
import {
  fixturePin,
  legacyDistFiles,
  packTarball,
  writeFiles,
} from './legacyArchitectFixture';

let root: string;
let appRoot: string;
let dist: string;
let tarball: string;
let sha256: string;

const cacheDir = () =>
  join(appRoot, 'node_modules', '.cache', 'architect-legacy');

const packFixture = (
  files: Record<string, string | null> = legacyDistFiles(),
  extraTarArgs: string[] = [],
) => {
  const source = mkdtempSync(join(root, 'source-'));
  writeFiles(source, files);
  return packTarball(source, tarball, extraTarArgs);
};

const okResponse = (bytes: Uint8Array) =>
  new Response(new Uint8Array(bytes), { status: 200 });

const run = (
  options: Partial<Parameters<typeof bundleLegacyArchitect>[0]> = {},
) =>
  bundleLegacyArchitect({
    appRoot,
    dist,
    pin: fixturePin(sha256),
    env: { ARCHITECT_LEGACY_V8_TARBALL: tarball },
    fetchImpl: vi.fn<typeof fetch>(),
    retryDelayMs: 0,
    log: () => {},
    ...options,
  });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bundle-legacy-architect-'));
  appRoot = join(root, 'app');
  dist = join(appRoot, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), 'architect 9');
  tarball = join(root, 'architect-v8-dist.tgz');
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

describe('bundleLegacyArchitect', () => {
  it('does nothing when nothing is pinned', async () => {
    await expect(run({ pin: null })).resolves.toBeNull();
    expect(existsSync(join(dist, 'v8'))).toBe(false);
  });

  it('installs a local tarball into dist/v8 without its hosting files or maps', async () => {
    await expect(run()).resolves.toBe(join(dist, 'v8'));

    const installed = readdirSync(join(dist, 'v8'), { recursive: true })
      .map(String)
      .toSorted();
    expect(installed).toEqual(
      [
        'assets',
        join('assets', 'main-abc.js'),
        join('assets', 'preview-abc.js'),
        'dist-info.json',
        'index.html',
        'manifest.webmanifest',
        'preview',
        join('preview', 'index.html'),
        'sw.js',
      ].toSorted(),
    );
    // This app's own output is untouched, and no extraction directory is left.
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toBe('architect 9');
    expect(readdirSync(cacheDir())).toEqual([]);
  });

  it('replaces an Architect 8 already in dist', async () => {
    writeFiles(join(dist, 'v8'), { 'stale.js': 'old' });
    await run();
    expect(existsSync(join(dist, 'v8', 'stale.js'))).toBe(false);
    expect(existsSync(join(dist, 'v8', 'index.html'))).toBe(true);
  });

  it('refuses a local tarball that does not match the pin', async () => {
    await expect(run({ pin: fixturePin('b'.repeat(64)) })).rejects.toThrow(
      /ARCHITECT_LEGACY_V8_TARBALL .* hashes to/,
    );
    expect(existsSync(join(dist, 'v8'))).toBe(false);
  });

  it('refuses a local tarball that does not exist', async () => {
    await expect(
      run({ env: { ARCHITECT_LEGACY_V8_TARBALL: join(root, 'missing.tgz') } }),
    ).rejects.toThrow(/does not exist/);
  });

  it('downloads the pinned tarball, retrying a failure, then reuses the cached copy', async () => {
    const bytes = readFileSync(tarball);
    const fetchImpl = vi
      .fn<typeof fetch>()
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
    const offline = vi.fn<typeof fetch>();
    await run({ env: {}, fetchImpl: offline });
    expect(offline).not.toHaveBeenCalled();
    expect(existsSync(join(dist, 'v8', 'index.html'))).toBe(true);
  });

  it('discards a cached copy that no longer matches and downloads again', async () => {
    mkdirSync(cacheDir(), { recursive: true });
    writeFileSync(join(cacheDir(), `${sha256}.tgz`), 'corrupt');
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okResponse(readFileSync(tarball)));
    await run({ env: {}, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(existsSync(join(dist, 'v8', 'index.html'))).toBe(true);
  });

  it('never retries into a download that hashes wrong', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
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
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('fetch failed'));
    await expect(run({ env: {}, fetchImpl, attempts: 2 })).rejects.toThrow(
      /after 2 attempts .*ARCHITECT_LEGACY_V8_TARBALL/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(existsSync(join(dist, 'v8'))).toBe(false);
  });

  it('refuses a build that is not the pinned one', async () => {
    sha256 = packFixture(
      legacyDistFiles({
        'sw.js':
          'self.workbox.core.setCacheNameDetails({prefix:"architect-8.5.0-turbo-0123456789abcdef"});',
      }),
    );
    await expect(run()).rejects.toThrow(/precaches under "architect-8\.5\.0/);
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
