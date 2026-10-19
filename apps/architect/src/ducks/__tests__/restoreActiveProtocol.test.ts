import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type CurrentProtocol,
  withInterfaceText,
} from '@codaco/protocol-validation';
import { APP_SCHEMA_VERSION } from '~/config';

import createTimeline from '../middleware/timeline';
import activeProtocol, { setActiveProtocol } from '../modules/activeProtocol';
import app, {
  getActiveProtocolId,
  getProtocolLockState,
  getStorageUnavailable,
  setActiveProtocolId,
  setProtocolLockState,
  setStorageUnavailable,
} from '../modules/app';
import {
  restoreActiveProtocolAfterStoreRehydration,
  restoreActiveProtocolFromLibrary,
} from '../restoreActiveProtocol';

const makeProtocol = (name: string): CurrentProtocol =>
  withInterfaceText({
    name,
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
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
      schemaVersion: 9,
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

  // A bookmarked or typed /protocol URL in a session that has no protocol id at
  // all: the same "no protocol behind this route" state as a missing row, and
  // it must settle on Home the same way.
  it('blocks a protocol route when there is no session to restore', async () => {
    const store = makeStore();

    const result = await restoreActiveProtocolFromLibrary(store, {
      getStoredProtocol,
      replaceProtocolRoute,
    });

    expect(result).toBe('none');
    expect(getStoredProtocol).not.toHaveBeenCalled();
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
      schemaVersion: 9,
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
    getStoredProtocol.mockResolvedValue({
      id: 'legacy',
      schemaVersion: 9,
      protocol: legacy,
    });
    const refusal = {
      status: 'validation-error',
      message: 'Legacy protocol is invalid',
    } as const;
    const admit = vi.fn().mockResolvedValue({
      success: false,
      refusal,
    });
    const onInvalid = vi.fn();

    const result = await restoreActiveProtocolFromLibrary(store, {
      getStoredProtocol,
      admitStoredProtocol: admit,
      replaceProtocolRoute,
      onInvalid,
    });

    expect(result).toBe('invalid');
    expect(admit).toHaveBeenCalledWith({
      id: 'legacy',
      schemaVersion: 9,
      protocol: legacy,
    });
    expect(getActiveProtocolId(store.getState())).toBeNull();
    expect(store.getState().activeProtocol.present).toBeNull();
    expect(replaceProtocolRoute).toHaveBeenCalledTimes(1);
    expect(onInvalid).toHaveBeenCalledWith(refusal);
  });

  // The restored session is the second way into a stored protocol, and it must
  // reach exactly the same verdicts as a library open.
  describe('schema compatibility of the restored row', () => {
    // This library holds only this schema's protocols, so a row claiming an
    // older one is refused rather than upgraded in place.
    it('refuses a row that records an older schema, and opens nothing', async () => {
      const store = makeStore();
      store.dispatch(setActiveProtocolId('older'));
      getStoredProtocol.mockResolvedValue({
        id: 'older',
        name: 'Older study',
        schemaVersion: 8,
        protocol: {
          ...makeProtocol('Older study'),
          schemaVersion: 8,
        } as unknown as CurrentProtocol,
        // Marked valid under the schema of its own day.
        validated: true,
        createdAt: 0,
        updatedAt: 0,
      });
      const onInvalid = vi.fn();

      const result = await restoreActiveProtocolFromLibrary(store, {
        getStoredProtocol,
        replaceProtocolRoute,
        onInvalid,
      });

      expect(result).toBe('invalid');
      expect(store.getState().activeProtocol.present).toBeNull();
      expect(getActiveProtocolId(store.getState())).toBeNull();
      expect(onInvalid).toHaveBeenCalledWith({
        status: 'validation-error',
        message: expect.stringContaining('schema version 8'),
      });
      expect(replaceProtocolRoute).toHaveBeenCalledTimes(1);
    });

    it('refuses a row written by a newer Architect', async () => {
      const newerSchemaVersion = APP_SCHEMA_VERSION + 1;
      const store = makeStore();
      store.dispatch(setActiveProtocolId('newer'));
      getStoredProtocol.mockResolvedValue({
        id: 'newer',
        name: 'Future study',
        schemaVersion: newerSchemaVersion,
        protocol: {
          ...makeProtocol('Future study'),
          schemaVersion: newerSchemaVersion,
        },
        validated: true,
        createdAt: 0,
        updatedAt: 0,
      });
      const onInvalid = vi.fn();

      const result = await restoreActiveProtocolFromLibrary(store, {
        getStoredProtocol,
        replaceProtocolRoute,
        onInvalid,
      });

      expect(result).toBe('invalid');
      expect(store.getState().activeProtocol.present).toBeNull();
      expect(onInvalid).toHaveBeenCalledWith({
        status: 'app-upgrade-required',
        protocolSchemaVersion: newerSchemaVersion,
      });
      expect(replaceProtocolRoute).toHaveBeenCalledTimes(1);
    });
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
      schemaVersion: 9,
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

// The whole `app` slice is persisted to sessionStorage, so a reload restores
// whatever cross-tab lock state this tab was in — including `reclaim-blocked`,
// whose stage draft did NOT survive. Left in place it would make the tab refuse
// every write, and drive a reclaim off rehydrated state with no lock event
// behind it.
describe('restoreActiveProtocolAfterStoreRehydration — cross-tab lock state', () => {
  it.each(['rehydrated', 'timed-out', 'failed'] as const)(
    'starts a %s session owning the protocol',
    async (rehydrationResult) => {
      const store = makeStore();
      store.dispatch(setProtocolLockState('reclaim-blocked'));

      await restoreActiveProtocolAfterStoreRehydration(
        store,
        rehydrationResult,
        {
          getStoredProtocol: vi.fn().mockResolvedValue(undefined),
          replaceProtocolRoute: vi.fn(),
          clearRememberedSession: vi.fn(),
          onError: vi.fn(),
        },
      );

      expect(getProtocolLockState(store.getState())).toBe('owned');
    },
  );
});
