import { getActiveProtocolId } from '~/ducks/modules/app';
import { syncProtocolReview } from '~/ducks/modules/protocolReview';
import type { RootState } from '~/ducks/modules/root';

type ReviewSyncStore = {
  getState: () => RootState;
  dispatch: (thunk: ReturnType<typeof syncProtocolReview>) => unknown;
  subscribe: (listener: () => void) => () => void;
};

/**
 * Keeps the protocol review slice on the active protocol: whenever the active
 * protocol id changes — opened, switched, closed, deleted, or restored after
 * a reload — its stored review is read, or the slice cleared and a review in
 * flight for the previous protocol aborted.
 *
 * A store subscription rather than listener middleware, because a reload
 * restores the active id through redux-remember's enhancer, whose action
 * never passes through middleware. A subscriber sees every state change
 * whatever dispatched it.
 */
export const keepProtocolReviewOnActiveProtocol = (
  store: ReviewSyncStore,
): (() => void) => {
  let syncedId = getActiveProtocolId(store.getState());
  return store.subscribe(() => {
    const id = getActiveProtocolId(store.getState());
    if (id === syncedId) return;
    // Recorded before dispatching: the sync's own actions re-enter here.
    syncedId = id;
    void store.dispatch(syncProtocolReview());
  });
};
