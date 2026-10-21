import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BundledLegacyInterviewer } from '../../legacyInterviewer';

const bundled = vi.hoisted(() => ({
  current: null as BundledLegacyInterviewer | null,
  pending: false,
}));
vi.mock('../../legacyInterviewer', () => ({
  getBundledLegacyInterviewer: () => bundled.current,
}));
vi.mock('../legacyInterviewerServiceWorker', () => ({
  isLegacyInterviewerInstallPending: () => bundled.pending,
}));

const { parseWorkerScript, readOfflineDownload, resetOfflineDownload } =
  await import('../offlineDownload');

const ORIGIN = 'https://interviewer.test';
const ROOT_BUILD = 'interviewer-9.0.0-turbo-abc';
const V8_BUILD = 'interviewer-v8-8.5.0-direct-def';

/** A worker script shaped like the ones Workbox generates. */
const workerScript = (buildId: string, files: string[]) =>
  `define(["./workbox-1"],function(e){"use strict";importScripts("pwa-cache-reclamation-${buildId}.js"),self.skipWaiting(),e.precacheAndRoute([${files
    .map((url) => `{url:"${url}",revision:"r"}`)
    .join(
      ',',
    )}],{directoryIndex:null}),e.registerRoute(({url:s})=>s,new e.NetworkOnly)});`;

const ROOT_SCRIPT = workerScript(ROOT_BUILD, ['a.js', 'b.js', 'c.js', 'd.js']);
const V8_SCRIPT = workerScript(V8_BUILD, [
  'v1.js',
  'v2.js',
  'v3.js',
  'v4.js',
  'v5.js',
  'v6.js',
]);

const registration = (
  scope: string,
  installing: { scriptURL: string } | null,
) => ({ scope: `${ORIGIN}${scope}`, installing });

const cacheStorage = (contents: Record<string, number>) =>
  ({
    keys: () => Promise.resolve(Object.keys(contents)),
    open: (name: string) =>
      Promise.resolve({
        keys: () =>
          Promise.resolve(Array.from({ length: contents[name] ?? 0 })),
      }),
  }) as unknown as CacheStorage;

const dependencies = ({
  registrations,
  cached,
}: {
  registrations: Record<string, ReturnType<typeof registration>>;
  cached: Record<string, number>;
}) => ({
  container: {
    getRegistration: (scope: string) =>
      Promise.resolve(registrations[scope] ?? registrations['/']),
  } as unknown as ServiceWorkerContainer,
  cacheStorage: cacheStorage(cached),
  fetchScript: vi.fn((url: string) =>
    url.endsWith('/v8/sw.js')
      ? Promise.resolve(V8_SCRIPT)
      : Promise.resolve(ROOT_SCRIPT),
  ),
  origin: ORIGIN,
});

beforeEach(() => {
  bundled.current = null;
  bundled.pending = false;
  resetOfflineDownload();
});

describe('parseWorkerScript', () => {
  it('reads the build and how many files the precache lists', () => {
    expect(parseWorkerScript(ROOT_SCRIPT)).toEqual({
      buildId: ROOT_BUILD,
      total: 4,
    });
  });

  it('says nothing about a script that is not a generated worker', () => {
    expect(parseWorkerScript('self.addEventListener("fetch", () => {})')).toBe(
      null,
    );
    expect(
      parseWorkerScript(
        'importScripts("pwa-cache-reclamation-x.js");e.precacheAndRoute([],{})',
      ),
    ).toBe(null);
  });
});

describe('readOfflineDownload', () => {
  it('counts the files downloaded so far while this app’s worker installs', async () => {
    const result = await readOfflineDownload(
      { ownReady: false, legacyReady: null },
      dependencies({
        registrations: {
          '/': registration('/', { scriptURL: `${ORIGIN}/sw.js` }),
        },
        cached: { [`${ROOT_BUILD}-precache-v2-${ORIGIN}/`]: 1 },
      }),
    );
    expect(result).toEqual({ downloading: true, progress: 0.25 });
  });

  it('adds Interviewer 8’s download to this app’s, counting a ready part as complete', async () => {
    bundled.current = { version: '8.5.0-direct-def', path: '/v8/' };
    const result = await readOfflineDownload(
      { ownReady: true, legacyReady: false },
      dependencies({
        registrations: {
          '/': registration('/', null),
          '/v8/': registration('/v8/', { scriptURL: `${ORIGIN}/v8/sw.js` }),
        },
        cached: { [`${V8_BUILD}-precache-v2-${ORIGIN}/v8/`]: 3 },
      }),
    );
    // 4 of this app's files, and 3 of Interviewer 8's 6.
    expect(result).toEqual({ downloading: true, progress: 0.7 });
  });

  it('counts Interviewer 8’s download as to come before its worker is registered', async () => {
    bundled.current = { version: '8.5.0-direct-def', path: '/v8/' };
    bundled.pending = true;
    const result = await readOfflineDownload(
      { ownReady: true, legacyReady: false },
      dependencies({
        registrations: { '/': registration('/', null) },
        cached: {},
      }),
    );
    expect(result).toEqual({ downloading: true, progress: 0.4 });
  });

  it('is not downloading when nothing installs and nothing is to come', async () => {
    bundled.current = { version: '8.5.0-direct-def', path: '/v8/' };
    const deps = dependencies({
      registrations: { '/': registration('/', null) },
      cached: {},
    });
    await expect(
      readOfflineDownload({ ownReady: true, legacyReady: false }, deps),
    ).resolves.toEqual({ downloading: false, progress: null });
    expect(deps.fetchScript).not.toHaveBeenCalled();
  });

  it('cannot tell how far it has got when a script cannot be read', async () => {
    const deps = dependencies({
      registrations: {
        '/': registration('/', { scriptURL: `${ORIGIN}/sw.js` }),
      },
      cached: {},
    });
    deps.fetchScript.mockRejectedValueOnce(new TypeError('offline'));
    await expect(
      readOfflineDownload({ ownReady: false, legacyReady: null }, deps),
    ).resolves.toEqual({ downloading: true, progress: null });

    // Asked again next time.
    await expect(
      readOfflineDownload({ ownReady: false, legacyReady: null }, deps),
    ).resolves.toEqual({ downloading: true, progress: 0 });
  });

  it('keeps downloading when how far it has got cannot be read', async () => {
    const deps = dependencies({
      registrations: {
        '/': registration('/', { scriptURL: `${ORIGIN}/sw.js` }),
      },
      cached: {},
    });
    deps.cacheStorage.keys = () => Promise.reject(new Error('denied'));
    await expect(
      readOfflineDownload({ ownReady: false, legacyReady: null }, deps),
    ).resolves.toEqual({ downloading: true, progress: null });
  });

  it('reads the script again for each new worker, as every build shares its URL', async () => {
    const deps = dependencies({
      registrations: {
        '/': registration('/', { scriptURL: `${ORIGIN}/sw.js` }),
      },
      cached: { [`${ROOT_BUILD}-precache-v2-${ORIGIN}/`]: 4 },
    });
    await expect(
      readOfflineDownload({ ownReady: false, legacyReady: null }, deps),
    ).resolves.toEqual({ downloading: true, progress: 1 });

    // A later deploy's worker starts installing in the same tab.
    const NEXT_BUILD = 'interviewer-9.0.1-turbo-ghi';
    deps.fetchScript.mockResolvedValue(
      workerScript(NEXT_BUILD, ['a.js', 'b.js', 'c.js', 'd.js']),
    );
    const next = dependencies({
      registrations: {
        '/': registration('/', { scriptURL: `${ORIGIN}/sw.js` }),
      },
      cached: {
        [`${ROOT_BUILD}-precache-v2-${ORIGIN}/`]: 4,
        [`${NEXT_BUILD}-precache-v2-${ORIGIN}/`]: 1,
      },
    });
    await expect(
      readOfflineDownload(
        { ownReady: false, legacyReady: null },
        { ...next, fetchScript: deps.fetchScript },
      ),
    ).resolves.toEqual({ downloading: true, progress: 0.25 });
  });

  it('is not downloading where there are no service workers', async () => {
    await expect(
      readOfflineDownload(
        { ownReady: false, legacyReady: null },
        {
          ...dependencies({ registrations: {}, cached: {} }),
          container: undefined,
        },
      ),
    ).resolves.toEqual({ downloading: false, progress: null });
  });
});
