import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import createTimeline from '../middleware/timeline';
import activeProtocol from '../modules/activeProtocol';
import app, {
  getActiveProtocolId,
  getStorageUnavailable,
  setActiveProtocolId,
  setStorageUnavailable,
} from '../modules/app';
import { restoreActiveProtocolFromLibrary } from '../restoreActiveProtocol';

const makeProtocol = (name: string): CurrentProtocol =>
  ({
    name,
    schemaVersion: 8,
    stages: [],
    codebook: {},
  }) as CurrentProtocol;

const reducer = combineReducers({
  app,
  activeProtocol: createTimeline(activeProtocol),
});

const makeStore = () => configureStore({ reducer });

describe('restoreActiveProtocolFromLibrary', () => {
  const getStoredProtocol = vi.fn();
  const replaceProtocolRoute = vi.fn();

  beforeEach(() => {
    getStoredProtocol.mockReset();
    replaceProtocolRoute.mockReset();
  });

  it('loads the canonical IndexedDB row and clears stale storage failure state', async () => {
    const store = makeStore();
    const canonical = makeProtocol('Canonical');
    store.dispatch(setActiveProtocolId('p1'));
    store.dispatch(setStorageUnavailable(true));
    getStoredProtocol.mockResolvedValue({
      id: 'p1',
      protocol: canonical,
    });

    const result = await restoreActiveProtocolFromLibrary(store, {
      getStoredProtocol,
      replaceProtocolRoute,
    });

    expect(result).toBe('restored');
    expect(store.getState().activeProtocol.present).toEqual(canonical);
    expect(getStorageUnavailable(store.getState())).toBe(false);
    expect(replaceProtocolRoute).not.toHaveBeenCalled();
  });

  it('clears the stale session and blocks a protocol route when the row is missing', async () => {
    const store = makeStore();
    store.dispatch(setActiveProtocolId('missing'));
    getStoredProtocol.mockResolvedValue(undefined);

    const result = await restoreActiveProtocolFromLibrary(store, {
      getStoredProtocol,
      replaceProtocolRoute,
    });

    expect(result).toBe('missing');
    expect(getActiveProtocolId(store.getState())).toBeNull();
    expect(store.getState().activeProtocol.present).toBeNull();
    expect(replaceProtocolRoute).toHaveBeenCalledTimes(1);
  });

  it('does not apply a stale read after the active protocol id changes', async () => {
    const store = makeStore();
    store.dispatch(setActiveProtocolId('p1'));
    let resolveRead: ((value: unknown) => void) | undefined;
    getStoredProtocol.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );

    const restoring = restoreActiveProtocolFromLibrary(store, {
      getStoredProtocol,
      replaceProtocolRoute,
    });
    store.dispatch(setActiveProtocolId('p2'));
    resolveRead?.({ id: 'p1', protocol: makeProtocol('Stale') });

    expect(await restoring).toBe('stale');
    expect(store.getState().activeProtocol.present).toBeNull();
    expect(getActiveProtocolId(store.getState())).toBe('p2');
  });

  it('settles safely and blocks the editor when IndexedDB rejects', async () => {
    const store = makeStore();
    store.dispatch(setActiveProtocolId('p1'));
    getStoredProtocol.mockRejectedValue(new Error('IndexedDB unavailable'));

    const result = await restoreActiveProtocolFromLibrary(store, {
      getStoredProtocol,
      replaceProtocolRoute,
    });

    expect(result).toBe('failed');
    expect(getActiveProtocolId(store.getState())).toBeNull();
    expect(store.getState().activeProtocol.present).toBeNull();
    expect(replaceProtocolRoute).toHaveBeenCalledTimes(1);
  });
});
