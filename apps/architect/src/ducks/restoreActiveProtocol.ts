import { disarmInMemoryUnloadGuard } from '~/utils/beforeUnloadGuard';
import { getStoredProtocol as readStoredProtocol } from '~/utils/protocolLibrary';
import { reportError } from '~/utils/reportError';
import { clearRememberedAppSession } from '~/utils/sessionStorageDriver';
import { reportStartupProtocolValidationFailure } from '~/utils/startupProtocolFailureQueue';
import { admitStoredProtocol as admitCanonicalProtocol } from '~/utils/storedProtocolAdmission';

import { timelineActions } from './middleware/timeline';
import {
  clearActiveProtocol,
  setActiveProtocol,
} from './modules/activeProtocol';
import {
  getActiveProtocolId,
  setActiveProtocolId,
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
  onInvalid?: (message: string) => void;
  admitStoredProtocol?: typeof admitCanonicalProtocol;
  clearRememberedSession?: () => void;
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
// can overwrite it. Provenance-marked rows open directly, while legacy rows
// receive a one-time validation before they can seed an editor session.
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
    // address, restored tab) has no protocol behind it. Settle on Home before
    // React mounts, as every other unrestorable branch below does.
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
    )(row);
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
    (dependencies.onInvalid ?? reportStartupProtocolValidationFailure)(
      admission.error.message,
    );
    return 'invalid';
  }

  store.dispatch(setStorageUnavailable(false));
  disarmInMemoryUnloadGuard();
  store.dispatch(setActiveProtocol(row.protocol));
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
