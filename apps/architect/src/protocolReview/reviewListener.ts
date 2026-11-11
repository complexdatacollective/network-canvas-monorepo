import { getActiveProtocolId } from '~/ducks/modules/app';
import {
  checkFixAvailability,
  syncProtocolReview,
} from '~/ducks/modules/protocolReview';
import type { RootState } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

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
 * And whenever the protocol itself changes — an edit, the app's Undo or
 * Redo, a fix — the review's fixes are checked again for it, whatever is on
 * screen, so a finding never stays `checking` for want of a component to ask.
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
  let checkedProtocol = getProtocol(store.getState());
  return store.subscribe(() => {
    const state = store.getState();
    const id = getActiveProtocolId(state);
    const protocol = getProtocol(state);
    if (id !== syncedId) {
      // Recorded before dispatching: the sync's own actions re-enter here.
      syncedId = id;
      checkedProtocol = protocol;
      // The sync checks the fixes once it has read the review.
      void store.dispatch(syncProtocolReview());
      return;
    }
    if (protocol === checkedProtocol) return;
    checkedProtocol = protocol;
    if (protocol && state.protocolReview.record?.review) {
      void store.dispatch(checkFixAvailability());
    }
  });
};
