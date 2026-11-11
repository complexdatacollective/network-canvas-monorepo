import {
  createListenerMiddleware,
  type TypedStartListening,
} from '@reduxjs/toolkit';

import { getActiveProtocolId } from '~/ducks/modules/app';
import { syncProtocolReview } from '~/ducks/modules/protocolReview';
import type { RootState } from '~/ducks/modules/root';
import type { AppDispatch } from '~/ducks/store';

/**
 * Keeps the protocol review slice on the active protocol: whenever the active
 * protocol id changes — opened, switched, closed, deleted, or restored after
 * a reload — its stored review is read, or the slice cleared and a review in
 * flight for the previous protocol aborted.
 */
export const protocolReviewListenerMiddleware = createListenerMiddleware();

type AppStartListening = TypedStartListening<RootState, AppDispatch>;
const startAppListening =
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Redux Toolkit's documented typed-listener pattern: createListenerMiddleware cannot name RootState and AppDispatch itself, as the store's types are built from this middleware
  protocolReviewListenerMiddleware.startListening as AppStartListening;

startAppListening({
  predicate: (_action, currentState, originalState) =>
    getActiveProtocolId(currentState) !== getActiveProtocolId(originalState),
  effect: async (_action, listenerApi) => {
    await listenerApi.dispatch(syncProtocolReview());
  },
});
