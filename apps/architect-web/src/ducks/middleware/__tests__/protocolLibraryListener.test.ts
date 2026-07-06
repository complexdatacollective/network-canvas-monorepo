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
// transaction; Dexie needs a real IndexedDB, so stub the transaction to just
// invoke its callback.
vi.mock('~/utils/assetDB', () => ({
  assetDb: {
    protocols: {},
    transaction: (_mode: string, _table: unknown, cb: () => Promise<void>) =>
      cb(),
  },
}));

import activeProtocol, {
  setActiveProtocol,
  updateProtocolDescription,
} from '../../modules/activeProtocol';
import app, {
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

const makeStore = () => {
  const reducer = combineReducers({
    app,
    activeProtocol: createTimeline(activeProtocol, {
      exclude: () => false,
    }),
  });
  return configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).prepend(
        protocolLibraryListenerMiddleware.middleware,
      ),
  });
};

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
