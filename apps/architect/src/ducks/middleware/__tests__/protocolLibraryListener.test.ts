import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

const getStoredProtocol = vi.fn();
const putStoredProtocol = vi.fn();

vi.mock('~/utils/protocolLibrary', () => ({
  getStoredProtocol: (...args: unknown[]) => getStoredProtocol(...args),
  putStoredProtocol: (...args: unknown[]) => putStoredProtocol(...args),
}));

vi.mock('~/utils/assetDB', () => ({
  assetDb: {
    protocols: {},
    assets: {},
    transaction: (_mode: string, ...rest: unknown[]) =>
      (rest[rest.length - 1] as () => Promise<void>)(),
  },
}));

import { rootReducer } from '../../modules/root';
import { protocolCommitAccepted } from '../../protocolCommit';
import { protocolLibraryListenerMiddleware } from '../protocolLibraryListener';

const makeProtocol = (name: string): CurrentProtocol =>
  ({
    name,
    schemaVersion: 8,
    stages: [],
    codebook: {},
  }) as CurrentProtocol;

const makeStore = () =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).prepend(
        protocolLibraryListenerMiddleware.middleware,
      ),
  });

const flushEffects = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('protocolLibraryListener', () => {
  beforeEach(() => {
    getStoredProtocol.mockReset().mockResolvedValue({ id: 'p1' });
    putStoredProtocol.mockReset().mockResolvedValue(undefined);
  });

  it('writes an accepted commit immediately without a debounce timer', async () => {
    const store = makeStore();
    const protocol = makeProtocol('Study');

    store.dispatch(
      protocolCommitAccepted({
        id: 'p1',
        protocol,
        persistenceAllowed: true,
      }),
    );
    await flushEffects();

    expect(putStoredProtocol).toHaveBeenCalledWith({
      id: 'p1',
      protocol,
      name: 'Study',
      description: undefined,
      retainedAssetIds: new Set(),
    });
  });

  it('never observes arbitrary protocol mutation actions', async () => {
    const store = makeStore();

    store.dispatch({
      type: 'activeProtocol/updateProtocolDescription',
      payload: { description: 'unvalidated' },
    });
    await flushEffects();

    expect(putStoredProtocol).not.toHaveBeenCalled();
  });

  it('skips persistence when admission captured a read-only or unavailable session', async () => {
    const store = makeStore();

    store.dispatch(
      protocolCommitAccepted({
        id: 'p1',
        protocol: makeProtocol('Study'),
        persistenceAllowed: false,
      }),
    );
    await flushEffects();

    expect(putStoredProtocol).not.toHaveBeenCalled();
  });
});
