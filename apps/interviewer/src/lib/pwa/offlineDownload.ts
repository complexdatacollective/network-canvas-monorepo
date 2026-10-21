import { useEffect, useSyncExternalStore } from 'react';

import { getBundledLegacyInterviewer } from '../legacyInterviewer';
import {
  combineAppOffline,
  getOwnAppOffline,
  refreshAppOffline,
  useAppOffline,
} from './appOffline';
import {
  getLegacyInterviewerOffline,
  refreshLegacyInterviewerOffline,
} from './legacyInterviewerOffline';
import { isLegacyInterviewerInstallPending } from './legacyInterviewerServiceWorker';

// How far Interviewer has got with saving itself for offline use, for the
// status row and Settings while it is not ready yet.
//
// Two workers download what Interviewer needs: this app's own (scope `/`) and,
// when this build bundles it, Interviewer 8's (scope `/v8/`, registered in the
// background once this app's own is ready). Each downloads its precache into a
// cache named after its build (`<build>-precache-…`), one file after another.
// Each worker's script lists those files and names its build, so the share
// downloaded is the files in those caches out of the files the scripts list.
//
// While anything shows it and Interviewer is not ready, this asks again every
// second, and asks the browser again whether Interviewer is ready, so a
// missed worker event cannot leave the status behind.

export type OfflineDownload = {
  /** A download is under way, or about to start. */
  downloading: boolean;
  /** The share downloaded, from 0 to 1; null when it cannot be told. */
  progress: number | null;
};

const IDLE: OfflineDownload = { downloading: false, progress: null };

const POLL_INTERVAL_MS = 1_000;

type WorkerScript = {
  /** The build the script names, which names its precache. */
  buildId: string;
  /** How many files its precache holds once complete. */
  total: number;
};

/**
 * What a generated worker script says about its precache: the build that
 * names it (from the cache reclaimer it imports) and how many files it lists.
 * Null for a script that says neither.
 */
export function parseWorkerScript(source: string): WorkerScript | null {
  const build = /pwa-cache-reclamation-([A-Za-z0-9._-]+)\.js/.exec(source);
  const manifest = /precacheAndRoute\(\s*\[([\s\S]*?)\]\s*[,)]/.exec(source);
  if (!build?.[1] || !manifest?.[1]) return null;
  const total = manifest[1].match(/\burl\s*:/g)?.length ?? 0;
  return total > 0 ? { buildId: build[1], total } : null;
}

type Dependencies = {
  container: ServiceWorkerContainer | undefined;
  cacheStorage: CacheStorage | undefined;
  fetchScript: (url: string) => Promise<string>;
  origin: string;
};

const defaultDependencies = (): Dependencies => ({
  container:
    typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
  cacheStorage: typeof caches === 'undefined' ? undefined : caches,
  fetchScript: async (url) => {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.text();
  },
  origin: window.location.origin,
});

// Every build's worker has the same script URL, so an installing worker's
// script is read once per worker, and the deployed script, read while no
// worker installs, once per page load. A failed read is asked again on the
// next poll.
const workerScripts = new WeakMap<
  ServiceWorker,
  Promise<WorkerScript | null>
>();
const deployedScripts = new Map<string, Promise<WorkerScript | null>>();

const readScript = (
  worker: ServiceWorker | null,
  url: string,
  fetchScript: Dependencies['fetchScript'],
): Promise<WorkerScript | null> => {
  const forget = () =>
    worker ? workerScripts.delete(worker) : deployedScripts.delete(url);
  const known = worker ? workerScripts.get(worker) : deployedScripts.get(url);
  if (known) return known;
  const read = fetchScript(url).then(parseWorkerScript, () => {
    forget();
    return null;
  });
  if (worker) workerScripts.set(worker, read);
  else deployedScripts.set(url, read);
  return read;
};

/** How many files the precache of `buildId` holds so far. */
const countDownloaded = async (
  cacheStorage: CacheStorage | undefined,
  buildId: string,
): Promise<number> => {
  if (!cacheStorage) return 0;
  const name = (await cacheStorage.keys()).find((key) =>
    key.startsWith(`${buildId}-precache`),
  );
  if (!name) return 0;
  return (await (await cacheStorage.open(name)).keys()).length;
};

type Part = { done: number; total: number };

/**
 * One worker's share: complete once it is ready, otherwise the files in the
 * precache of the build its newest worker (or, before there is one, the
 * deployed script) names.
 */
const readPart = async (
  scope: string,
  ready: boolean,
  { container, cacheStorage, fetchScript, origin }: Dependencies,
): Promise<Part | null> => {
  const registration = await container?.getRegistration(scope);
  const ownRegistration =
    registration !== undefined &&
    new URL(registration.scope).pathname === scope;
  const worker = ownRegistration ? registration.installing : null;
  const script = await readScript(
    worker,
    worker?.scriptURL ?? new URL(`${scope}sw.js`, origin).href,
    fetchScript,
  );
  if (!script) return null;
  if (ready) return { done: script.total, total: script.total };
  const done = await countDownloaded(cacheStorage, script.buildId);
  return { done: Math.min(done, script.total), total: script.total };
};

/**
 * Read the download's state from the browser: whether a worker is installing
 * (or Interviewer 8's is still to be registered), and the share downloaded.
 * Never rejects: once a download is known to be under way, a failure to read
 * how far it has got leaves the share unknown.
 */
export async function readOfflineDownload(
  offline: {
    /** This app's own worker is ready. */
    ownReady: boolean;
    /** Interviewer 8's is ready; null when there is none, or not known yet. */
    legacyReady: boolean | null;
  },
  dependencies: Dependencies = defaultDependencies(),
): Promise<OfflineDownload> {
  const { container } = dependencies;
  if (!container) return IDLE;
  let downloading = false;
  try {
    const legacy = getBundledLegacyInterviewer();
    const scopes: [string, boolean][] = [['/', offline.ownReady]];
    if (legacy && offline.legacyReady !== null) {
      scopes.push([legacy.path, offline.legacyReady]);
    }
    const registrations = await Promise.all(
      scopes.map(([scope]) => container.getRegistration(scope)),
    );
    const installing = registrations.some(
      (registration, index) =>
        registration !== undefined &&
        new URL(registration.scope).pathname === scopes[index]?.[0] &&
        registration.installing !== null,
    );
    downloading =
      installing ||
      (legacy !== null &&
        offline.legacyReady === false &&
        isLegacyInterviewerInstallPending());
    if (!downloading) return IDLE;

    const parts = await Promise.all(
      scopes.map(([scope, ready]) => readPart(scope, ready, dependencies)),
    );
    if (parts.some((part) => part === null)) {
      return { downloading, progress: null };
    }
    const { done, total } = parts.reduce<Part>(
      (sum, part) => ({
        done: sum.done + (part?.done ?? 0),
        total: sum.total + (part?.total ?? 0),
      }),
      { done: 0, total: 0 },
    );
    return { downloading, progress: total > 0 ? done / total : null };
  } catch {
    return downloading ? { downloading, progress: null } : IDLE;
  }
}

let state: OfflineDownload = IDLE;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let polling = false;

const setState = (next: OfflineDownload) => {
  if (
    next.downloading === state.downloading &&
    next.progress === state.progress
  ) {
    return;
  }
  state = next;
  for (const listener of listeners) listener();
};

const stop = () => {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
};

const poll = async () => {
  if (polling) return;
  polling = true;
  try {
    await Promise.all([refreshAppOffline(), refreshLegacyInterviewerOffline()]);
    const own = getOwnAppOffline();
    const legacy = getLegacyInterviewerOffline();
    if (combineAppOffline(own, legacy) === 'ready') {
      stop();
      setState(IDLE);
      return;
    }
    setState(
      await readOfflineDownload({
        ownReady: own === 'ready',
        legacyReady:
          legacy === 'ready' ? true : legacy === 'not-ready' ? false : null,
      }),
    );
  } finally {
    polling = false;
  }
};

const start = () => {
  if (timer !== undefined) return;
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  void poll();
  timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
};

const getState = (): OfflineDownload => state;

/**
 * The download's state, followed while anything shows it and Interviewer is
 * not ready, including when it stops being ready later in the page's life.
 */
export function useOfflineDownload(): OfflineDownload {
  const offline = useAppOffline();
  const download = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => {
    if (offline === 'not-ready') start();
  }, [offline]);
  return download;
}

/** Forget what was read. For tests. */
export const resetOfflineDownload = (): void => {
  stop();
  polling = false;
  deployedScripts.clear();
  state = IDLE;
  for (const listener of listeners) listener();
};
