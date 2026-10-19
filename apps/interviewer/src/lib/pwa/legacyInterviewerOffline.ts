import { useEffect, useSyncExternalStore } from 'react';

import { getBundledLegacyInterviewer } from '../legacyInterviewer';

// Whether the bundled Interviewer 8 can run on this device without a network.
//
// Interviewer 8 keeps its own service worker (scope `/v8/`, its own precache),
// installed in the background after this app has started. It is ready offline
// once that worker is active: a worker only activates after its precache has
// been downloaded. This module holds the answer for the status row, Settings
// and the schema 8 cards; the code that registers the worker calls
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
 * Read the answer again from the browser: is a worker active for exactly
 * Interviewer 8's scope? (`getRegistration` answers with the closest
 * enclosing registration, which is this app's own `/` worker until
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
    const ownScope =
      registration !== undefined &&
      new URL(registration.scope).pathname === interviewer.path;
    setState(ownScope && registration.active ? 'ready' : 'not-ready');
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
