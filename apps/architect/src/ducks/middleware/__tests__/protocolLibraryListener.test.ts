import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

const getStoredProtocol = vi.fn();
const putStoredProtocol = vi.fn();

vi.mock('~/utils/protocolLibrary', () => ({
  getStoredProtocol: (...args: unknown[]) => getStoredProtocol(...args),
  putStoredProtocol: (...args: unknown[]) => putStoredProtocol(...args),
}));

// The autosave flush runs its existence-check + put inside an assetDb
// transaction scoped to `protocols` and `assets`; Dexie needs a real IndexedDB,
// so stub the transaction to just invoke its callback (the trailing arg).
vi.mock('~/utils/assetDB', () => ({
  assetDb: {
    protocols: {},
    assets: {},
    transaction: (_mode: string, ...rest: unknown[]) =>
      (rest[rest.length - 1] as () => Promise<void>)(),
  },
}));

import { REMEMBER_REHYDRATED } from 'redux-remember';

import {
  deserializeActiveProtocol,
  serializeActiveProtocol,
} from '../../activeProtocolPersistence';
import activeProtocol, {
  setActiveProtocol,
  updateProtocolDescription,
} from '../../modules/activeProtocol';
import app, {
  getActiveProtocolId,
  setActiveProtocolId,
  setProtocolOpenElsewhere,
} from '../../modules/app';
import { protocolLibraryListenerMiddleware } from '../protocolLibraryListener';
import createTimeline from '../timeline';

const makeProtocol = (name: string): CurrentProtocol =>
  ({
    name,
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  }) as CurrentProtocol;

const reducer = combineReducers({
  app,
  activeProtocol: createTimeline(activeProtocol, {
    exclude: () => false,
  }),
});

type TestState = ReturnType<typeof reducer>;

const makeStore = (preloadedState?: Partial<TestState>) =>
  configureStore({
    reducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).prepend(
        protocolLibraryListenerMiddleware.middleware,
      ),
  });

describe('protocolLibraryListener — autosave guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getStoredProtocol.mockReset().mockResolvedValue({ id: 'p1' });
    putStoredProtocol.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('autosaves an edit when the tab is the sole editor', async () => {
    const store = makeStore();
    store.dispatch(setActiveProtocolId('p1'));
    store.dispatch(setActiveProtocol(makeProtocol('Study')));

    store.dispatch(updateProtocolDescription({ description: 'edited' }));
    await vi.advanceTimersByTimeAsync(700);

    expect(putStoredProtocol).toHaveBeenCalledTimes(1);
  });

  it('does NOT autosave when the protocol is open in another tab', async () => {
    const store = makeStore();
    store.dispatch(setActiveProtocolId('p1'));
    store.dispatch(setActiveProtocol(makeProtocol('Study')));
    store.dispatch(setProtocolOpenElsewhere(true));

    store.dispatch(
      updateProtocolDescription({ description: 'edited in duplicate tab' }),
    );
    await vi.advanceTimersByTimeAsync(700);

    expect(putStoredProtocol).not.toHaveBeenCalled();
  });
});

// Regression for #772: redux-remember persists `app` (activeProtocolId) and
// `activeProtocol` (present) non-atomically, so a reload can rehydrate a NEW id
// paired with the PREVIOUS protocol's present. Without the reconcile, autosave
// flushes the old content into the new library row.
describe('protocolLibraryListener — rehydrate reconcile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getStoredProtocol.mockReset().mockResolvedValue({ id: 'new-id' });
    putStoredProtocol.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // Build the rehydrated `activeProtocol` slice exactly as store.ts would: the
  // persisted present is stamped with its owning id, then rebuilt into an
  // empty-history timeline on reload.
  const rehydratedSlice = (present: CurrentProtocol, stampedId: string) =>
    deserializeActiveProtocol(
      serializeActiveProtocol(
        { past: [], present, timeline: [], future: [], futureTimeline: [] },
        stampedId,
      ),
    );

  it('discards a rehydrated present whose stamped id does not match app.activeProtocolId', async () => {
    // app was persisted with the NEW id; activeProtocol still carried the OLD
    // protocol's present stamped with the OLD id.
    const store = makeStore({
      app: { activeProtocolId: 'new-id' },
      activeProtocol: rehydratedSlice(makeProtocol('Old Study'), 'old-id'),
    });

    store.dispatch({ type: REMEMBER_REHYDRATED });

    expect(store.getState().activeProtocol.present).toBeNull();
    expect(getActiveProtocolId(store.getState())).toBeNull();

    // A later edit must not flush the discarded present into the new row.
    store.dispatch(updateProtocolDescription({ description: 'edited' }));
    await vi.advanceTimersByTimeAsync(700);
    expect(putStoredProtocol).not.toHaveBeenCalled();
  });

  it('keeps a rehydrated present whose stamped id matches app.activeProtocolId', () => {
    const store = makeStore({
      app: { activeProtocolId: 'p1' },
      activeProtocol: rehydratedSlice(makeProtocol('Study'), 'p1'),
    });

    store.dispatch({ type: REMEMBER_REHYDRATED });

    expect(store.getState().activeProtocol.present).not.toBeNull();
    expect(getActiveProtocolId(store.getState())).toBe('p1');
  });

  it('does not autosave on the rehydrate action itself', async () => {
    const store = makeStore({
      app: { activeProtocolId: 'p1' },
      activeProtocol: rehydratedSlice(makeProtocol('Study'), 'p1'),
    });

    store.dispatch({ type: REMEMBER_REHYDRATED });
    await vi.advanceTimersByTimeAsync(700);

    expect(putStoredProtocol).not.toHaveBeenCalled();
  });
});
