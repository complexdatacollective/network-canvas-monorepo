import { useEffect, useSyncExternalStore } from 'react';

import {
  type BundledLegacyInterviewer,
  getBundledLegacyInterviewer,
  LEGACY_INTERVIEWER_CACHE_PREFIX,
} from '../legacyInterviewer';

// Whether the bundled Interviewer 8 can run on this device without a network.
//
// Interviewer 8 keeps its own service worker (scope `/v8/`, its own precache),
// installed in the background after this app has started. It is ready offline
// once its worker has finished installing the build this deploy pins: a worker
// installs only after its precache has been downloaded, and the precache is
// named after the build's version. So a worker that is still installing, a
// worker of an earlier pin (a deploy that changed the pin, before the new one
// has downloaded), and a worker whose precache has since been deleted all
// count as not ready. A worker of the pinned build that is waiting counts as
// ready: its precache is complete, and Interviewer 8 applies it when it next
// loads, offline too. This module holds the answer for the status row,
// Settings and the schema 8 cards; the code that registers the worker calls
// `refreshLegacyInterviewerOffline` when the registration changes.

export type LegacyInterviewerOffline =
  /** This build has no Interviewer 8. */
  | 'not-bundled'
  /** Not known yet. */
  | 'checking'
  | 'ready'
  /** Not (yet) installed for offline use on this device. */
  | 'not-ready';

const initialState = (): LegacyInterviewerOffline =>
  getBundledLegacyInterviewer() ? 'checking' : 'not-bundled';

let state: LegacyInterviewerOffline = initialState();
let checked = false;
const listeners = new Set<() => void>();

const setState = (next: LegacyInterviewerOffline) => {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getLegacyInterviewerOffline = (): LegacyInterviewerOffline =>
  state;

/**
 * Whether the cache storage holds the precache of exactly the bundled build.
 * Never rejects: storage that cannot be read holds nothing.
 */
export async function hasLegacyInterviewerPrecache(
  interviewer: BundledLegacyInterviewer,
  cacheStorage: CacheStorage | undefined = typeof caches === 'undefined'
    ? undefined
    : caches,
): Promise<boolean> {
  if (!cacheStorage) return false;
  const prefix = `${LEGACY_INTERVIEWER_CACHE_PREFIX}${interviewer.version}-`;
  try {
    return (await cacheStorage.keys()).some(
      (name) => name.startsWith(prefix) && name.includes('-precache-'),
    );
  } catch {
    return false;
  }
}

/**
 * Read the answer again from the browser: has a worker finished installing
 * for exactly Interviewer 8's scope, with nothing newer still installing, and
 * is the pinned build's precache there? (`getRegistration` answers with the
 * closest enclosing registration, which is this app's own `/` worker until
 * Interviewer 8 has one, so the scope is checked.) Never rejects.
 */
export async function refreshLegacyInterviewerOffline(): Promise<void> {
  checked = true;
  const interviewer = getBundledLegacyInterviewer();
  if (!interviewer) {
    setState('not-bundled');
    return;
  }
  const container =
    typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!container) {
    setState('not-ready');
    return;
  }
  try {
    const registration = await container.getRegistration(interviewer.path);
    const installed =
      registration !== undefined &&
      new URL(registration.scope).pathname === interviewer.path &&
      !registration.installing &&
      Boolean(registration.active ?? registration.waiting);
    setState(
      installed && (await hasLegacyInterviewerPrecache(interviewer))
        ? 'ready'
        : 'not-ready',
    );
  } catch {
    setState('not-ready');
  }
}

/** The current answer; checks once per page load on first use. */
export function useLegacyInterviewerOffline(): LegacyInterviewerOffline {
  const current = useSyncExternalStore(
    subscribe,
    getLegacyInterviewerOffline,
    getLegacyInterviewerOffline,
  );
  // The answer lives in the browser's service-worker registry, outside React;
  // asking it is a side effect of the first component that needs it.
  useEffect(() => {
    if (!checked) void refreshLegacyInterviewerOffline();
  }, []);
  return current;
}

/** Forget the cached answer. For tests. */
export const resetLegacyInterviewerOffline = (): void => {
  checked = false;
  state = initialState();
  for (const listener of listeners) listener();
};
