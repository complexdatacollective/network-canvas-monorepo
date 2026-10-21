import { useEffect, useSyncExternalStore } from 'react';

import {
  type LegacyInterviewerOffline,
  useLegacyInterviewerOffline,
} from './legacyInterviewerOffline';

// Whether Interviewer can run on this device without a network: one answer
// for the whole app, whatever the schema of the protocols on it. It is ready
// once everything it runs is saved on the device: this app's own worker has
// finished installing (a worker installs only after its precache has been
// downloaded), and, when this build bundles Interviewer 8, Interviewer 8's
// worker is ready too (see `legacyInterviewerOffline.ts`).
export type AppOffline =
  /** Not known yet. */
  | 'checking'
  | 'ready'
  /** Not (yet) saved for offline use on this device. */
  | 'not-ready';

type WorkerOffline = AppOffline;

let ownState: WorkerOffline = 'checking';
let checked = false;
const listeners = new Set<() => void>();

const setOwnState = (next: WorkerOffline) => {
  if (next === ownState) return;
  ownState = next;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getOwnState = (): WorkerOffline => ownState;

/** This app's own part of the answer, without Interviewer 8's. */
export const getOwnAppOffline = (): AppOffline => ownState;

const followed = new WeakSet<ServiceWorker>();

/** Check again each time `worker` changes state, until it settles. */
const followInstalling = (worker: ServiceWorker) => {
  if (followed.has(worker)) return;
  followed.add(worker);
  worker.addEventListener('statechange', function onStateChange() {
    void refreshAppOffline();
    if (worker.state === 'activated' || worker.state === 'redundant') {
      worker.removeEventListener('statechange', onStateChange);
    }
  });
};

const ownScopePath = (): string =>
  new URL(import.meta.env.BASE_URL, window.location.origin).pathname;

/**
 * Read this app's own part of the answer again from the browser: has a worker
 * finished installing for exactly this app's scope, with nothing newer still
 * installing? (`getRegistration` answers with the closest enclosing
 * registration, so the scope is checked.) Never rejects.
 */
export async function refreshAppOffline(): Promise<void> {
  checked = true;
  const container =
    typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!container) {
    setOwnState('not-ready');
    return;
  }
  try {
    const scope = ownScopePath();
    const registration = await container.getRegistration(scope);
    const ownScope =
      registration !== undefined &&
      new URL(registration.scope).pathname === scope;
    if (ownScope && registration.installing) {
      followInstalling(registration.installing);
    }
    setOwnState(
      ownScope &&
        !registration.installing &&
        Boolean(registration.active ?? registration.waiting)
        ? 'ready'
        : 'not-ready',
    );
  } catch {
    setOwnState('not-ready');
  }
}

/** The whole app's answer, from its own worker's and Interviewer 8's. */
export function combineAppOffline(
  own: WorkerOffline,
  legacy: LegacyInterviewerOffline,
): AppOffline {
  if (own === 'not-ready' || legacy === 'not-ready') return 'not-ready';
  if (own === 'checking' || legacy === 'checking') return 'checking';
  return 'ready';
}

/** The current answer; checks once per page load on first use. */
export function useAppOffline(): AppOffline {
  const own = useSyncExternalStore(subscribe, getOwnState, getOwnState);
  const legacy = useLegacyInterviewerOffline();
  // The answer lives in the browser's service-worker registry, outside React;
  // asking it is a side effect of the first component that needs it.
  useEffect(() => {
    if (!checked) void refreshAppOffline();
  }, []);
  return combineAppOffline(own, legacy);
}

/** Forget the cached answer. For tests. */
export const resetAppOffline = (): void => {
  checked = false;
  ownState = 'checking';
  for (const listener of listeners) listener();
};
