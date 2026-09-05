import { getArchitectIntl } from '~/i18n/imperative';
import { disarmInMemoryUnloadGuard } from '~/utils/beforeUnloadGuard';
import { getStoredProtocol as readStoredProtocol } from '~/utils/protocolLibrary';
import { reportError } from '~/utils/reportError';
import { clearRememberedAppSession } from '~/utils/sessionStorageDriver';
import { reportStartupProtocolFailure } from '~/utils/startupProtocolFailureQueue';
import {
  admitStoredProtocol as admitCanonicalProtocol,
  type StoredProtocolRefusal,
} from '~/utils/storedProtocolAdmission';

import { timelineActions } from './middleware/timeline';
import {
  clearActiveProtocol,
  setActiveProtocol,
} from './modules/activeProtocol';
import {
  getActiveProtocolId,
  setActiveProtocolId,
  setProtocolLockState,
  setStorageUnavailable,
} from './modules/app';
import type { AppDispatch, RootState } from './store';
import type { StoreRehydrationResult } from './storeRehydration';

type RestoreStore = {
  dispatch: AppDispatch;
  getState: () => Pick<RootState, 'app' | 'activeProtocol'>;
};

type RestoreDependencies = {
  getStoredProtocol?: typeof readStoredProtocol;
  replaceProtocolRoute?: () => void;
  onError?: (error: unknown) => void;
  onInvalid?: (refusal: StoredProtocolRefusal) => void;
  admitStoredProtocol?: typeof admitCanonicalProtocol;
  clearRememberedSession?: () => void;
  /**
   * Set by the cross-tab reclaim, which re-reads the canonical row while the
   * researcher stays on the same protocol on the same route. Startup leaves it
   * unset: there the session really is beginning.
   *
   * It only ever reaches the timeline middleware, and only lets it skip
   * discarding undo history when the row it just read is identical to what is
   * already in the buffer. A row that DIFFERS still resets, because then a peer
   * tab edited and this tab's history describes a lineage that no longer exists
   * — undoing into it would overwrite work this tab never saw (#1382).
   */
  continuingSession?: boolean;
};

export type RestoreActiveProtocolResult =
  | 'none'
  | 'restored'
  | 'missing'
  | 'failed'
  | 'invalid'
  | 'stale';

const replaceProtocolRoute = (): void => {
  if (window.location.pathname.startsWith('/protocol')) {
    history.replaceState(null, '', '/');
  }
};

const clearRestoredSession = (store: RestoreStore): void => {
  store.dispatch(setActiveProtocolId(null));
  store.dispatch(clearActiveProtocol());
  store.dispatch(timelineActions.reset(null));
};

// Restore only the active protocol identifier from sessionStorage. Protocol
// content always comes from the canonical IndexedDB row; no session-stored body
// can overwrite it. `admitStoredProtocol` decides what that row is allowed to
// become: a row below this build's schema is upgraded in place, one above it is
// refused, provenance-marked rows open directly, and legacy rows receive a
// one-time validation before they can seed an editor session.
export const restoreActiveProtocolFromLibrary = async (
  store: RestoreStore,
  dependencies: RestoreDependencies = {},
): Promise<RestoreActiveProtocolResult> => {
  const getStoredProtocol =
    dependencies.getStoredProtocol ?? readStoredProtocol;
  const blockProtocolRoute =
    dependencies.replaceProtocolRoute ?? replaceProtocolRoute;

  const protocolId = getActiveProtocolId(store.getState());
  if (!protocolId) {
    // There is no session to restore, so a /protocol URL (bookmark, typed
    // address, restored tab) has no protocol behind it. Settle on Home, as
    // every other unrestorable branch below does.
    //
    // This used to say "before React mounts", which was true when startup was
    // the only caller. `useProtocolTabLock.finishReclaim` now calls this
    // mid-session with React mounted, so the raw `history.replaceState` runs
    // there too and the router does not hear it. Not a defect —
    // `ProtocolRouteGuard` converges on a real navigation — but the route
    // change is no longer guaranteed to happen before anything is rendering.
    blockProtocolRoute();
    return 'none';
  }

  let row: Awaited<ReturnType<typeof getStoredProtocol>>;
  try {
    row = await getStoredProtocol(protocolId);
  } catch (error: unknown) {
    // A newer session may have replaced this one while IndexedDB resolved. A
    // stale failure must not clear or report against the newer session.
    if (getActiveProtocolId(store.getState()) !== protocolId) {
      return 'stale';
    }

    // A failed canonical read must never leave a route mounted against an empty
    // or session-derived protocol. Settle startup on Home and surface the
    // underlying storage error through the normal error reporter.
    clearRestoredSession(store);
    store.dispatch(setStorageUnavailable(true));
    blockProtocolRoute();
    (dependencies.onError ?? reportError)(error);
    return 'failed';
  }

  // The active id can change while IndexedDB is resolving. Never let that stale
  // result replace a newer session.
  if (getActiveProtocolId(store.getState()) !== protocolId) {
    return 'stale';
  }

  if (!row) {
    clearRestoredSession(store);
    blockProtocolRoute();
    return 'missing';
  }

  let admission: Awaited<ReturnType<typeof admitCanonicalProtocol>>;
  try {
    admission = await (
      dependencies.admitStoredProtocol ?? admitCanonicalProtocol
    )(row, undefined, getArchitectIntl());
  } catch (error: unknown) {
    if (getActiveProtocolId(store.getState()) !== protocolId) return 'stale';
    clearRestoredSession(store);
    blockProtocolRoute();
    (dependencies.onError ?? reportError)(error);
    return 'failed';
  }

  if (getActiveProtocolId(store.getState()) !== protocolId) return 'stale';
  if (!admission.success) {
    clearRestoredSession(store);
    blockProtocolRoute();
    (dependencies.onInvalid ?? reportStartupProtocolFailure)(admission.refusal);
    return 'invalid';
  }

  store.dispatch(setStorageUnavailable(false));
  disarmInMemoryUnloadGuard();
  // Seed from what admission returned, not from the row that was read: a row
  // written under an older schema has been upgraded and re-saved by now, and
  // the editor must hold the upgraded document rather than the stale one.
  const { protocol } = admission;
  store.dispatch(
    dependencies.continuingSession
      ? {
          ...setActiveProtocol(protocol),
          meta: { continuingSession: true },
        }
      : setActiveProtocol(protocol),
  );
  return 'restored';
};

// Settle startup before React mounts. A failed or timed-out session restore
// cannot safely retain a protocol URL because there is no canonical protocol
// body to back the editor on that route.
export const restoreActiveProtocolAfterStoreRehydration = async (
  store: RestoreStore,
  rehydrationResult: StoreRehydrationResult,
  dependencies: RestoreDependencies = {},
): Promise<
  RestoreActiveProtocolResult | Exclude<StoreRehydrationResult, 'rehydrated'>
> => {
  // The whole `app` slice is persisted to sessionStorage, so a reload restores
  // whatever cross-tab lock state this tab happened to be in — including
  // `reclaim-blocked`, whose blocker did NOT survive: neither a stage draft nor
  // a nested editor's values are persisted, so the state would outlive the
  // thing that justified it and refuse every write with nothing left to
  // resolve. It is derived from the BroadcastChannel and belongs to a session,
  // so a new one starts from "this tab owns it" and lets the first claim settle
  // the truth.
  store.dispatch(setProtocolLockState('owned'));

  if (rehydrationResult === 'rehydrated') {
    return await restoreActiveProtocolFromLibrary(store, dependencies);
  }

  (dependencies.clearRememberedSession ?? clearRememberedAppSession)();
  clearRestoredSession(store);
  (dependencies.replaceProtocolRoute ?? replaceProtocolRoute)();

  if (rehydrationResult === 'timed-out') {
    const error = new Error(
      'Session state restoration timed out; using a fresh session.',
    );
    if (dependencies.onError) {
      dependencies.onError(error);
    } else {
      reportError(error, { operation: 'session-state-rehydration' });
    }
  }

  return rehydrationResult;
};
