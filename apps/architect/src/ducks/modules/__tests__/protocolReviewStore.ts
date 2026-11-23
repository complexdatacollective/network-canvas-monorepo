import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { expect, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId, setProtocolLockState } from '~/ducks/modules/app';
import { rootReducer } from '~/ducks/modules/root';
import { makeProtocol } from '~/protocolReview/__tests__/fixtures';
import { keepProtocolReviewOnActiveProtocol } from '~/protocolReview/reviewListener';

/** The app's store, with the review following the active protocol as it does in the app. */
export const makeReviewStore = (middleware: Middleware[] = []) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).concat(middleware),
  });
  keepProtocolReviewOnActiveProtocol(store);
  return store;
};

export type ReviewStore = ReturnType<typeof makeReviewStore>;

let opened = 0;

/**
 * Switches the tab to `protocol` as library row `id` (a fresh one by
 * default), owned here, without waiting for its review record.
 */
export const switchToProtocol = (
  store: ReviewStore,
  protocol: CurrentProtocol = makeProtocol(),
  id = `protocol-${(opened += 1)}`,
) => {
  store.dispatch(setProtocolLockState('owned'));
  store.dispatch(setActiveProtocolId(id));
  store.dispatch(setActiveProtocol(protocol));
  return id;
};

/** Opens `protocol` as the app does, and waits for its review record. */
export const openProtocol = async (
  store: ReviewStore,
  protocol?: CurrentProtocol,
  id?: string,
) => {
  const openedId = switchToProtocol(store, protocol, id);
  await vi.waitFor(() => {
    expect(store.getState().protocolReview.record?.protocolId).toBe(openedId);
  });
  return openedId;
};
