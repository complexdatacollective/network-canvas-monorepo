import {
  type BundledLegacyArchitect,
  getBundledLegacyArchitect,
  LEGACY_ARCHITECT_MAJOR,
} from './legacyArchitect';
import { reportError } from './reportError';

// Architect 8, served at /v8/ beside this app, has its own service worker and
// precache, and this app's worker never answers for /v8/ (see vite.config.ts).
// Left to itself, Architect 8 would work offline only once the researcher had
// opened it online — so "Keep editing as schema 8" or "Open in Architect 8"
// would fail offline for anyone who never had. This app therefore registers
// Architect 8's worker in the background, which then downloads and keeps its
// own precache; its cache name changes only when the pin does.
//
// It must never slow this app down, so it waits until this app has rendered,
// its own worker is ready (the downloads would otherwise compete, and this
// app's is the one that matters), and the browser is idle.
//
// Only once this page's own build is the active root worker. A root worker
// from a build before Architect 8 was bundled can still be active (when this
// build's has not installed yet), and its cache reclaimer knows nothing of
// `/v8/`: it would delete Architect 8's precache as an unleased `architect-`
// cache the next time this page reported ready. This build's reclaimer leaves
// `architect-v8-` alone, so until it is active the registration waits for a
// later load.
//
// A registration whose precache has gone (cache storage cleared or evicted
// while the registration survived) is registered again: an update check finds
// the same script and installs nothing, so Architect 8 would otherwise stay
// unavailable offline.

type WorkerLike = { scriptURL: string } | null;

type RegistrationLike = {
  scope: string;
  active: WorkerLike;
  installing: WorkerLike;
  waiting: WorkerLike;
  update: () => Promise<unknown>;
  unregister: () => Promise<boolean>;
};

/** The parts of `navigator.serviceWorker` this uses. */
type ServiceWorkerContainerLike = {
  ready: Promise<{ scope: string }>;
  getRegistration: (clientURL: string) => Promise<RegistrationLike | undefined>;
  register: (scriptURL: string, options: { scope: string }) => Promise<unknown>;
};

type Environment = {
  architect: BundledLegacyArchitect | null;
  serviceWorker: ServiceWorkerContainerLike | undefined;
  /** Calls back once the browser is idle (or has waited long enough). */
  whenIdle: (callback: () => void) => void;
  origin: string;
  /** This page's build, as its root worker records it (`__PWA_BUILD_ID__`). */
  buildId: string | undefined;
  /** The build the active root worker recorded for `scope`, if any. */
  readActiveRootBuild: (scope: string) => Promise<string | undefined>;
  /** Whether the pinned build's precache is in cache storage. */
  hasPrecache: (architect: BundledLegacyArchitect) => Promise<boolean>;
};

/** The longest an idle callback may be put off before it runs anyway. */
export const LEGACY_WORKER_IDLE_TIMEOUT_MS = 10_000;

/** Where there is no `requestIdleCallback` (Safari), wait this long instead. */
export const LEGACY_WORKER_FALLBACK_DELAY_MS = 2_000;

export const whenBrowserIdle = (callback: () => void): void => {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => callback(), {
      timeout: LEGACY_WORKER_IDLE_TIMEOUT_MS,
    });
    return;
  }
  window.setTimeout(callback, LEGACY_WORKER_FALLBACK_DELAY_MS);
};

// Where the root worker's cache reclaimer records the build that activated
// (scripts/buildtime/pwa-cache-reclamation-plugin.ts, with vite.config.ts's
// `appCachePrefix`). A test pins these against the generated worker.
export const ACTIVE_BUILD_CACHE = 'architect-pwa-cache-metadata';
export const ACTIVE_BUILD_KEY = '__pwa-active-build__';

/** What Architect 8's caches are named with (the pin's `cachePrefix`). */
export const LEGACY_ARCHITECT_CACHE_PREFIX = `architect-v${LEGACY_ARCHITECT_MAJOR}-`;

/** The build the active root worker recorded. `caches.match` never creates. */
const readActiveRootBuild = async (
  scope: string,
): Promise<string | undefined> => {
  if (typeof caches === 'undefined') return undefined;
  const response = await caches.match(new URL(ACTIVE_BUILD_KEY, scope).href, {
    cacheName: ACTIVE_BUILD_CACHE,
  });
  return response?.text();
};

/**
 * Whether cache storage holds the precache of exactly the bundled build
 * (`architect-v8-<version>-…-precache-…`, after Architect 8's `cacheId`).
 * Storage that cannot be read holds nothing.
 */
const hasPrecache = async (
  architect: BundledLegacyArchitect,
): Promise<boolean> => {
  if (typeof caches === 'undefined') return false;
  const prefix = `${LEGACY_ARCHITECT_CACHE_PREFIX}${architect.version}-`;
  try {
    return (await caches.keys()).some(
      (name) => name.startsWith(prefix) && name.includes('-precache-'),
    );
  } catch {
    return false;
  }
};

const defaultEnvironment = (): Environment => ({
  architect: getBundledLegacyArchitect(),
  serviceWorker:
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker
      : undefined,
  whenIdle: whenBrowserIdle,
  origin: window.location.origin,
  // Read through `typeof`: tests and Storybook do not define it.
  buildId:
    typeof __PWA_BUILD_ID__ === 'undefined' ? undefined : __PWA_BUILD_ID__,
  readActiveRootBuild,
  hasPrecache,
});

let started = false;

/**
 * Register the bundled Architect 8's worker for `/v8/`, once per page load.
 * Does nothing when this build bundles no Architect 8 or the browser has no
 * service workers. When `/v8/` already has a worker for the same script,
 * active or installing, it checks that worker for an update instead, so a
 * newer pinned Architect 8 is fetched and precached too, and registers it
 * again when its precache has gone. Waits for a later
 * load while the active root worker is another build's. Never rejects: a failure
 * is reported and leaves Architect 8 to install its worker on its first visit,
 * as it would anyway.
 */
export const registerLegacyArchitectWorker = async (
  overrides: Partial<Environment> = {},
): Promise<void> => {
  if (started) return;
  started = true;
  const {
    architect,
    serviceWorker,
    whenIdle,
    origin,
    buildId,
    readActiveRootBuild: readRootBuild,
    hasPrecache: hasPinnedPrecache,
  } = {
    ...defaultEnvironment(),
    ...overrides,
  };
  if (!architect || !serviceWorker) return;

  const scope = new URL(architect.path, origin).href;
  const scriptPath = `${architect.path}sw.js`;
  const scriptURL = new URL(scriptPath, origin).href;
  const isThisScript = (worker: WorkerLike) => worker?.scriptURL === scriptURL;

  try {
    const root = await serviceWorker.ready;
    await new Promise<void>((resolve) => whenIdle(resolve));
    // A root worker of another build may reclaim what is downloaded here.
    if (!buildId || (await readRootBuild(root.scope)) !== buildId) return;
    // `getRegistration` answers with the registration whose scope best covers
    // the URL — this app's own, at `/`, while Architect 8 has none — so the
    // scope is checked as well as the script.
    const existing = await serviceWorker.getRegistration(scope);
    if (
      existing?.scope === scope &&
      (isThisScript(existing.active) || isThisScript(existing.installing))
    ) {
      // `register()` with the script a registration already has returns it
      // without fetching the script, so a newer pinned Architect 8 (served at
      // the same URL) is only picked up by asking for an update.
      await existing.update();
      if (
        existing.installing ||
        existing.waiting ||
        (await hasPinnedPrecache(architect))
      ) {
        return;
      }
      await existing.unregister();
    }
    await serviceWorker.register(scriptPath, { scope: architect.path });
  } catch (error: unknown) {
    reportError(error, { operation: 'legacy-architect-worker-register' });
  }
};
