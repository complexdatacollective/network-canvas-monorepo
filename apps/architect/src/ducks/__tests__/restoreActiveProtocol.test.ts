import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import createTimeline from '../middleware/timeline';
import activeProtocol, { setActiveProtocol } from '../modules/activeProtocol';
import app, {
  getActiveProtocolId,
  getStorageUnavailable,
  setActiveProtocolId,
  setStorageUnavailable,
} from '../modules/app';
import {
  restoreActiveProtocolAfterStoreRehydration,
  restoreActiveProtocolFromLibrary,
} from '../restoreActiveProtocol';

const makeProtocol = (name: string): CurrentProtocol => ({
  name,
  schemaVersion: 8,
  stages: [],
  codebook: {},
});

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
      validated: true,
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
    resolveRead?.({
      id: 'p1',
      protocol: makeProtocol('Stale'),
      validated: true,
    });

    expect(await restoring).toBe('stale');
    expect(store.getState().activeProtocol.present).toBeNull();
    expect(getActiveProtocolId(store.getState())).toBe('p2');
  });

  it('does not clear a newer session when a stale IndexedDB read rejects', async () => {
    const store = makeStore();
    const newerProtocol = makeProtocol('Newer');
    store.dispatch(setActiveProtocolId('p1'));
    let rejectRead: ((reason?: unknown) => void) | undefined;
    getStoredProtocol.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRead = reject;
        }),
    );
    const onError = vi.fn();

    const restoring = restoreActiveProtocolFromLibrary(store, {
      getStoredProtocol,
      replaceProtocolRoute,
      onError,
    });
    store.dispatch(setActiveProtocolId('p2'));
    store.dispatch(setActiveProtocol(newerProtocol));
    rejectRead?.(new Error('stale IndexedDB failure'));

    expect(await restoring).toBe('stale');
    expect(getActiveProtocolId(store.getState())).toBe('p2');
    expect(store.getState().activeProtocol.present).toEqual(newerProtocol);
    expect(getStorageUnavailable(store.getState())).toBe(false);
    expect(replaceProtocolRoute).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
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

  it('hard-blocks an invalid unproven legacy row before opening the editor', async () => {
    const store = makeStore();
    store.dispatch(setActiveProtocolId('legacy'));
    const legacy = makeProtocol('Legacy invalid');
    getStoredProtocol.mockResolvedValue({ id: 'legacy', protocol: legacy });
    const error = new Error('Legacy protocol is invalid');
    const admitStoredProtocol = vi.fn().mockResolvedValue({
      success: false,
      error,
    });
    const onInvalid = vi.fn();

    const result = await restoreActiveProtocolFromLibrary(store, {
      getStoredProtocol,
      admitStoredProtocol,
      replaceProtocolRoute,
      onInvalid,
    });

    expect(result).toBe('invalid');
    expect(admitStoredProtocol).toHaveBeenCalledWith({
      id: 'legacy',
      protocol: legacy,
    });
    expect(getActiveProtocolId(store.getState())).toBeNull();
    expect(store.getState().activeProtocol.present).toBeNull();
    expect(replaceProtocolRoute).toHaveBeenCalledTimes(1);
    expect(onInvalid).toHaveBeenCalledWith(error.message);
  });
});

describe('restoreActiveProtocolAfterStoreRehydration', () => {
  it.each(['failed', 'timed-out'] as const)(
    'clears the session and blocks protocol routes when rehydration is %s',
    async (rehydrationResult) => {
      const store = makeStore();
      store.dispatch(setActiveProtocolId('stale'));
      store.dispatch(setActiveProtocol(makeProtocol('Stale session body')));
      const replaceProtocolRoute = vi.fn();
      const clearRememberedSession = vi.fn();
      const onError = vi.fn();

      await restoreActiveProtocolAfterStoreRehydration(
        store,
        rehydrationResult,
        { replaceProtocolRoute, clearRememberedSession, onError },
      );

      expect(getActiveProtocolId(store.getState())).toBeNull();
      expect(store.getState().activeProtocol.present).toBeNull();
      expect(store.getState().activeProtocol.past).toEqual([]);
      expect(store.getState().activeProtocol.future).toEqual([]);
      expect(clearRememberedSession).toHaveBeenCalledTimes(1);
      expect(replaceProtocolRoute).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(
        rehydrationResult === 'timed-out' ? 1 : 0,
      );
    },
  );

  it('restores the canonical row after successful rehydration', async () => {
    const store = makeStore();
    const canonical = makeProtocol('Canonical');
    store.dispatch(setActiveProtocolId('p1'));
    const getStoredProtocol = vi.fn().mockResolvedValue({
      id: 'p1',
      protocol: canonical,
      validated: true,
    });
    const replaceProtocolRoute = vi.fn();

    await restoreActiveProtocolAfterStoreRehydration(store, 'rehydrated', {
      getStoredProtocol,
      replaceProtocolRoute,
    });

    expect(store.getState().activeProtocol.present).toEqual(canonical);
    expect(replaceProtocolRoute).not.toHaveBeenCalled();
  });
});
