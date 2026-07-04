import type { Dispatch, UnknownAction } from '@reduxjs/toolkit';

import {
  createProtocolTabLock,
  type ProtocolTabLock,
} from '~/utils/protocolTabLock';

import { getActiveProtocolId, setProtocolOpenElsewhere } from './modules/app';
import type { RootState } from './modules/root';

type LockFactory = (options: {
  onExclusivityChange: (exclusive: boolean) => void;
}) => ProtocolTabLock;

// The sync only reads the `app` slice and dispatches plain actions, so it is
// typed against the minimal store surface it needs — this also avoids importing
// AppDispatch from ./store, which would create an import cycle with the store.
type SyncStore = {
  getState: () => Pick<RootState, 'app'>;
  dispatch: Dispatch;
  subscribe: (listener: () => void) => () => void;
};

const syncActiveProtocol = (
  id: string | null,
  dispatch: Dispatch,
  lock: ProtocolTabLock,
): void => {
  if (id) {
    // Optimistically treat this tab as the sole editor. If another tab already
    // holds this protocol it replies over the channel and the exclusivity
    // callback re-flags it read-only. Clearing here also recovers a reloaded tab
    // whose persisted flag was stale: the lock starts a fresh claim assuming
    // exclusivity, which fires no change callback, so without this the tab could
    // stay stuck read-only after its peer has closed.
    dispatch(setProtocolOpenElsewhere(false));
    lock.claimProtocol(id);
  } else {
    lock.releaseProtocol();
    // Leaving a protocol clears any stale "open elsewhere" state.
    dispatch(setProtocolOpenElsewhere(false));
  }
};

// Bridges the non-redux protocol tab lock to the store via a subscription:
// whenever the active protocol id changes — including redux-remember's startup
// rehydrate, which does not pass through listener middleware — claim it on the
// shared channel; when the lock reports another tab already holds it, flag
// `protocolOpenElsewhere` so autosave is disabled and a banner is shown. Exposed
// as a factory so tests can inject a fake lock. Returns an unsubscribe.
export const createProtocolTabLockSync = (
  store: SyncStore,
  lockFactory: LockFactory = createProtocolTabLock,
): (() => void) => {
  const lock = lockFactory({
    onExclusivityChange: (exclusive) => {
      store.dispatch(setProtocolOpenElsewhere(!exclusive));
    },
  });

  let lastId = getActiveProtocolId(store.getState());
  // Claim a synchronously-preloaded active protocol; on a fresh store the id is
  // null and the rehydrate/first-open below does the claim.
  if (lastId) {
    syncActiveProtocol(lastId, store.dispatch, lock);
  }

  return store.subscribe(() => {
    const id = getActiveProtocolId(store.getState());
    if (id !== lastId) {
      lastId = id;
      syncActiveProtocol(id, store.dispatch, lock);
    }
  });
};
