import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';

import type { ProtocolTabLock } from '~/utils/protocolTabLock';

import app, {
  getProtocolOpenElsewhere,
  setActiveProtocolId,
} from '../modules/app';
import { createProtocolTabLockSync } from '../protocolTabLockSync';

// A controllable stand-in for the BroadcastChannel-backed lock: the test drives
// exclusivity changes by invoking the captured callback, and records claim/
// release calls.
const makeFakeLock = () => {
  let onExclusivityChange: ((exclusive: boolean) => void) | undefined;
  const claims: string[] = [];
  const releases: number[] = [];

  const lock: ProtocolTabLock = {
    claimProtocol: (id: string) => {
      claims.push(id);
    },
    releaseProtocol: () => {
      releases.push(1);
    },
    isExclusive: () => true,
    close: () => {},
  };

  const factory = (opts?: {
    onExclusivityChange?: (exclusive: boolean) => void;
  }) => {
    onExclusivityChange = opts?.onExclusivityChange;
    return lock;
  };

  return {
    factory,
    claims,
    releases,
    fireExclusivity: (exclusive: boolean) => onExclusivityChange?.(exclusive),
  };
};

const makeStore = () =>
  configureStore({
    reducer: combineReducers({ app }),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

describe('protocolTabLockSync', () => {
  it('claims the protocol when one becomes active', () => {
    const fake = makeFakeLock();
    const store = makeStore();
    createProtocolTabLockSync(store, fake.factory);

    store.dispatch(setActiveProtocolId('p1'));

    expect(fake.claims).toEqual(['p1']);
  });

  it('claims an already-active protocol on init (rehydrated id)', () => {
    const fake = makeFakeLock();
    const store = makeStore();
    // Simulate redux-remember having rehydrated an active protocol before the
    // lock sync starts — the mechanism that listener middleware missed.
    store.dispatch(setActiveProtocolId('p1'));

    createProtocolTabLockSync(store, fake.factory);

    expect(fake.claims).toEqual(['p1']);
  });

  it('releases the lock when the active protocol is cleared', () => {
    const fake = makeFakeLock();
    const store = makeStore();
    createProtocolTabLockSync(store, fake.factory);

    store.dispatch(setActiveProtocolId('p1'));
    store.dispatch(setActiveProtocolId(null));

    expect(fake.releases.length).toBe(1);
  });

  it('flags protocolOpenElsewhere when the lock loses exclusivity', () => {
    const fake = makeFakeLock();
    const store = makeStore();
    createProtocolTabLockSync(store, fake.factory);

    store.dispatch(setActiveProtocolId('p1'));
    expect(getProtocolOpenElsewhere(store.getState())).toBe(false);

    fake.fireExclusivity(false);
    expect(getProtocolOpenElsewhere(store.getState())).toBe(true);

    fake.fireExclusivity(true);
    expect(getProtocolOpenElsewhere(store.getState())).toBe(false);
  });

  it('claims only when the active id actually changes', () => {
    const fake = makeFakeLock();
    const store = makeStore();
    createProtocolTabLockSync(store, fake.factory);

    store.dispatch(setActiveProtocolId('p1'));
    // A redundant re-set of the same id doesn't change state, so no re-claim.
    store.dispatch(setActiveProtocolId('p1'));
    store.dispatch(setActiveProtocolId('p2'));

    expect(fake.claims).toEqual(['p1', 'p2']);
  });

  it('wires the exclusivity callback through the lock factory', () => {
    const factory = vi.fn(makeFakeLock().factory);
    const store = makeStore();

    createProtocolTabLockSync(store, factory);

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        onExclusivityChange: expect.any(Function),
      }),
    );
  });
});
