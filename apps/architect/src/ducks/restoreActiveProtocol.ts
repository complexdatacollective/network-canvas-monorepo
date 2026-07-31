import { disarmInMemoryUnloadGuard } from '~/utils/beforeUnloadGuard';
import { getStoredProtocol as readStoredProtocol } from '~/utils/protocolLibrary';
import { reportError } from '~/utils/reportError';
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
  const protocolId = getActiveProtocolId(store.getState());
  if (!protocolId) return 'none';

  const getStoredProtocol =
    dependencies.getStoredProtocol ?? readStoredProtocol;
  const blockProtocolRoute =
    dependencies.replaceProtocolRoute ?? replaceProtocolRoute;

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
