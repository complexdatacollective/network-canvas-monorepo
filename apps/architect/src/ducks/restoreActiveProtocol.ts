import { disarmInMemoryUnloadGuard } from '~/utils/beforeUnloadGuard';
import { getStoredProtocol as readStoredProtocol } from '~/utils/protocolLibrary';
import { reportError } from '~/utils/reportError';

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
};

export type RestoreActiveProtocolResult =
  | 'none'
  | 'restored'
  | 'missing'
  | 'failed'
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
// can overwrite it, and trusted canonical admission is not revalidated.
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

  store.dispatch(setStorageUnavailable(false));
  disarmInMemoryUnloadGuard();
  store.dispatch(setActiveProtocol(row.protocol));
  return 'restored';
};
