import {
  type BundledLegacyInterviewer,
  getBundledLegacyInterviewer,
  LEGACY_INTERVIEWER_CACHE_PREFIX,
} from '../legacyInterviewer';
import {
  hasLegacyInterviewerPrecache,
  refreshLegacyInterviewerOffline,
} from './legacyInterviewerOffline';

// Makes the bundled Interviewer 8 available offline without slowing this app.
//
// Interviewer 8 is never in this app's precache (vite.config.ts leaves dist/v8
// out). It keeps its own service worker at `/v8/sw.js`, scope `/v8/`, which
// downloads its own precache once it is registered. A researcher who has never
// opened `/v8/` must still be able to start a schema 8 interview offline, so
// this app registers that worker itself, in the background: once per page
// load, only after this app has rendered (the caller is an effect), its own
// worker is ready (so the two downloads never compete) and the browser is
// idle.
//
// Only once the active root worker leaves Interviewer 8's caches alone. A
// device coming from a released 8.x root build can still have that build's
// worker active (when this app's own worker has not installed yet), and its
// cache reclaimer knows nothing of `/v8/`: it would delete Interviewer 8's
// precache as an unleased `interviewer-` cache the next time this page
// reported ready. This app's reclaimer leaves `interviewer-v8-` alone and
// records that when it activates, so the registration goes ahead under any
// build that recorded it, or under this page's own build; under any other it
// waits for a later load. (A page is always the newest deploy when online,
// while the root worker stays on the build it activated until the update is
// installed, so requiring this page's own build would hold Interviewer 8 back
// after every deploy.)
//
// A registration that already has a worker for that script is checked for an
// update instead: the browser looks for one only on a visit to `/v8/`, and a
// device opened only at `/` would otherwise keep the build it first
// downloaded after a deploy changed the pin (`sw.js` is never cached, so a
// changed pin installs the new build in the background; it then waits, and
// Interviewer 8 applies it when it next loads). A worker of the pinned build
// whose precache has gone is registered again, since an update finds nothing
// new to install. Failures are reported and never shown: the status row and
// Settings say whether Interviewer 8 is ready offline, and that answer is
// refreshed here as the registration progresses.

/** How long to wait for an idle moment before registering anyway. */
export const IDLE_TIMEOUT_MS = 10_000;
/** Where `requestIdleCallback` is missing (older Safari), wait this long. */
export const IDLE_FALLBACK_DELAY_MS = 2_000;

export type LegacyInterviewerInstallOutcome =
  /** This build has no Interviewer 8. */
  | 'not-bundled'
  /** No service workers here (an insecure context, or an old browser). */
  | 'unsupported'
  /** Already asked during this page load. */
  | 'already-started'
  /** This page's own build is not the active root worker yet. */
  | 'deferred'
  /**
   * A worker for Interviewer 8's script is already active or on its way, and
   * was checked for an update.
   */
  | 'already-registered'
  | 'registered'
  /** Registered again: the pinned build's precache had gone. */
  | 'reinstalled'
  | 'failed';

type InstallDependencies = {
  interviewer: BundledLegacyInterviewer | null;
  container: ServiceWorkerContainer | undefined;
  origin: string;
  /** This page's build, as its root worker records it (`__PWA_BUILD_ID__`). */
  buildId: string | undefined;
  /** The build the active root worker recorded for `scope`, if any. */
  readActiveRootBuild: (scope: string) => Promise<string | undefined>;
  /** The other apps' cache prefixes the active root worker leaves alone. */
  readActiveRootForeignPrefixes: (scope: string) => Promise<readonly string[]>;
  /** Whether the pinned build's precache is in cache storage. */
  hasPrecache: (interviewer: BundledLegacyInterviewer) => Promise<boolean>;
  /** Run `callback` once the browser is idle (or the timeout has passed). */
  whenIdle: (callback: () => void) => void;
  /** Called whenever whether Interviewer 8 is ready offline may have changed. */
  refresh: () => void;
  report: (error: unknown) => void;
};

const defaultWhenIdle = (callback: () => void): void => {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => callback(), { timeout: IDLE_TIMEOUT_MS });
    return;
  }
  window.setTimeout(callback, IDLE_FALLBACK_DELAY_MS);
};

// Where the root worker's cache reclaimer records the build that activated
// (scripts/buildtime/pwa-cache-reclamation-plugin.ts, with vite.config.ts's
// `appCachePrefix`). A test pins these against the generated worker.
const ROOT_CACHE_PREFIX = 'interviewer-';
export const ACTIVE_BUILD_CACHE = `${ROOT_CACHE_PREFIX}pwa-cache-metadata`;
export const ACTIVE_BUILD_KEY = '__pwa-active-build__';
export const ACTIVE_BUILD_FOREIGN_PREFIXES_KEY =
  '__pwa-active-build-foreign-prefixes__';

/** The build the active root worker recorded. `caches.match` never creates. */
const defaultReadActiveRootBuild = async (
  scope: string,
): Promise<string | undefined> => {
  if (typeof caches === 'undefined') return undefined;
  const response = await caches.match(new URL(ACTIVE_BUILD_KEY, scope).href, {
    cacheName: ACTIVE_BUILD_CACHE,
  });
  return response?.text();
};

const isForeignPrefixesRecord = (
  value: unknown,
): value is { buildId: string; foreignCachePrefixes: string[] } => {
  if (typeof value !== 'object' || value === null) return false;
  const buildId: unknown = Reflect.get(value, 'buildId');
  const prefixes: unknown = Reflect.get(value, 'foreignCachePrefixes');
  return (
    typeof buildId === 'string' &&
    Array.isArray(prefixes) &&
    prefixes.every((prefix: unknown) => typeof prefix === 'string')
  );
};

/**
 * The prefixes the active root worker recorded, when it was that worker that
 * recorded them: an older build that does not write the record leaves the
 * build record pointing at itself, so another build's record is not trusted.
 */
const defaultReadActiveRootForeignPrefixes = async (
  scope: string,
): Promise<readonly string[]> => {
  if (typeof caches === 'undefined') return [];
  const [record, activeBuild] = await Promise.all([
    caches.match(new URL(ACTIVE_BUILD_FOREIGN_PREFIXES_KEY, scope).href, {
      cacheName: ACTIVE_BUILD_CACHE,
    }),
    defaultReadActiveRootBuild(scope),
  ]);
  if (!record || !activeBuild) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(await record.text());
  } catch {
    return [];
  }
  return isForeignPrefixesRecord(parsed) && parsed.buildId === activeBuild
    ? parsed.foreignCachePrefixes
    : [];
};

/**
 * Resolves once `worker` has finished activating. The root worker records its
 * build while it activates, after `ready` has already resolved.
 */
const whenActivated = (worker: ServiceWorker | null): Promise<void> =>
  worker?.state === 'activating'
    ? new Promise((resolve) => {
        worker.addEventListener('statechange', function onStateChange() {
          if (worker.state === 'activating') return;
          worker.removeEventListener('statechange', onStateChange);
          resolve();
        });
      })
    : Promise.resolve();

const defaultDependencies = (): Omit<InstallDependencies, 'report'> => ({
  interviewer: getBundledLegacyInterviewer(),
  container:
    typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
  origin: window.location.origin,
  // Read through `typeof`: tests and Storybook do not define it.
  buildId:
    typeof __PWA_BUILD_ID__ === 'undefined' ? undefined : __PWA_BUILD_ID__,
  readActiveRootBuild: defaultReadActiveRootBuild,
  readActiveRootForeignPrefixes: defaultReadActiveRootForeignPrefixes,
  hasPrecache: (interviewer) => hasLegacyInterviewerPrecache(interviewer),
  whenIdle: defaultWhenIdle,
  refresh: () => void refreshLegacyInterviewerOffline(),
});

let started = false;
let pending = false;

/**
 * Whether this page load's background install has started and not settled
 * yet: Interviewer 8's download is still to come, or under way.
 */
export const isLegacyInterviewerInstallPending = (): boolean => pending;

/**
 * Refresh the offline answer each time a worker of `registration` changes
 * state, until one is active (a worker activates only once its precache has
 * been downloaded).
 */
const refreshAsItInstalls = (
  registration: ServiceWorkerRegistration,
  refresh: () => void,
): void => {
  const follow = (worker: ServiceWorker | null) => {
    worker?.addEventListener('statechange', function onStateChange() {
      refresh();
      if (worker.state === 'activated' || worker.state === 'redundant') {
        worker.removeEventListener('statechange', onStateChange);
      }
    });
  };
  follow(registration.installing ?? registration.waiting);
  registration.addEventListener('updatefound', () =>
    follow(registration.installing),
  );
};

/**
 * Register Interviewer 8's worker in the background, once per page load.
 * Never rejects: a failure is passed to `report` and resolves `'failed'`.
 */
export async function installLegacyInterviewerInBackground(
  report: (error: unknown) => void,
  overrides: Partial<Omit<InstallDependencies, 'report'>> = {},
): Promise<LegacyInterviewerInstallOutcome> {
  if (started) return 'already-started';
  started = true;
  const {
    interviewer,
    container,
    origin,
    buildId,
    readActiveRootBuild,
    readActiveRootForeignPrefixes,
    hasPrecache,
    whenIdle,
    refresh,
  } = {
    ...defaultDependencies(),
    ...overrides,
  };
  if (!interviewer) return 'not-bundled';
  if (!container) return 'unsupported';

  pending = true;
  try {
    // This app's own worker first: Interviewer 8's precache must never delay
    // this app's own offline download, or its start-up.
    const root = await container.ready;
    await new Promise<void>((resolve) => whenIdle(resolve));
    await whenActivated(root.active);

    // A root worker that does not leave Interviewer 8's caches alone may
    // reclaim what is downloaded here.
    const keepsLegacyCaches = (
      await readActiveRootForeignPrefixes(root.scope)
    ).includes(LEGACY_INTERVIEWER_CACHE_PREFIX);
    if (
      !keepsLegacyCaches &&
      (!buildId || (await readActiveRootBuild(root.scope)) !== buildId)
    ) {
      refresh();
      return 'deferred';
    }

    const scope = interviewer.path;
    const scriptURL = new URL(`${scope}sw.js`, origin).href;
    // `getRegistration` answers with the closest enclosing registration,
    // which is this app's own `/` worker until Interviewer 8 has one.
    const existing = await container.getRegistration(scope);
    if (
      existing &&
      new URL(existing.scope).pathname === scope &&
      [existing.active, existing.waiting, existing.installing].some(
        (worker) => worker?.scriptURL === scriptURL,
      )
    ) {
      refreshAsItInstalls(existing, refresh);
      // Offline, or a server error: keep what is installed.
      const reachedServer = await existing.update().then(
        () => true,
        () => false,
      );
      if (
        reachedServer &&
        !existing.installing &&
        !existing.waiting &&
        !(await hasPrecache(interviewer))
      ) {
        await existing.unregister();
        const registration = await container.register(scriptURL, { scope });
        refreshAsItInstalls(registration, refresh);
        refresh();
        return 'reinstalled';
      }
      refresh();
      return 'already-registered';
    }

    const registration = await container.register(scriptURL, { scope });
    refreshAsItInstalls(registration, refresh);
    refresh();
    return 'registered';
  } catch (error) {
    report(error);
    refresh();
    return 'failed';
  } finally {
    pending = false;
  }
}

/** Forget that this page load already asked. For tests. */
export const resetLegacyInterviewerInstall = (): void => {
  started = false;
  pending = false;
};
