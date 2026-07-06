import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import app, {
  getProtocolOpenElsewhere,
  setActiveProtocolId,
} from '~/ducks/modules/app';
import type { ProtocolTabLock } from '~/utils/protocolTabLock';

import { useProtocolTabLock } from '../useProtocolTabLock';

const mockLocation = vi.fn(() => '/protocol');
vi.mock('wouter', () => ({
  useLocation: () => [mockLocation(), vi.fn()],
}));

// Only isProtocolPath is used; stub it so the test doesn't pull the real store
// (useProtocolNavGuard imports it at module scope).
vi.mock('~/hooks/useProtocolNavGuard', () => ({
  isProtocolPath: (path: string) => path.startsWith('/protocol'),
}));

const makeFakeLock = () => {
  let onExclusivityChange: ((exclusive: boolean) => void) | undefined;
  const claims: string[] = [];
  const releases: number[] = [];
  let closed = 0;

  const lock: ProtocolTabLock = {
    claimProtocol: (id: string) => {
      claims.push(id);
    },
    releaseProtocol: () => {
      releases.push(1);
    },
    isExclusive: () => true,
    close: () => {
      closed += 1;
    },
  };

  const factory = (opts: {
    onExclusivityChange: (exclusive: boolean) => void;
  }) => {
    onExclusivityChange = opts.onExclusivityChange;
    return lock;
  };

  return {
    factory,
    claims,
    releases,
    get closed() {
      return closed;
    },
    fireExclusivity: (exclusive: boolean) => onExclusivityChange?.(exclusive),
  };
};

const renderTabLock = (
  fakeFactory: ReturnType<typeof makeFakeLock>['factory'],
) => {
  const store = configureStore({ reducer: { app } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const view = renderHook(() => useProtocolTabLock(fakeFactory), { wrapper });
  return { store, ...view };
};

describe('useProtocolTabLock', () => {
  beforeEach(() => {
    mockLocation.mockReturnValue('/protocol');
  });

  it('claims the active protocol while on a /protocol route', () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    const { store } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });

    expect(fake.claims).toEqual(['p1']);
  });

  it('does NOT claim on Home even when a protocol is active — and releases', () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/');
    const { store } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });

    expect(fake.claims).toEqual([]);
    expect(fake.releases.length).toBeGreaterThanOrEqual(1);
  });

  it('releases the lock when navigating from the editor back to Home', () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    const { store, rerender } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });
    expect(fake.claims).toEqual(['p1']);

    const releasesBefore = fake.releases.length;
    mockLocation.mockReturnValue('/');
    act(() => {
      rerender();
    });

    expect(fake.releases.length).toBeGreaterThan(releasesBefore);
  });

  it('does not re-claim when navigating between /protocol sub-routes', () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    const { store, rerender } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });
    expect(fake.claims).toEqual(['p1']);

    mockLocation.mockReturnValue('/protocol/assets');
    act(() => {
      rerender();
    });

    expect(fake.claims).toEqual(['p1']);
  });

  it('claims when a protocol becomes active while already on the editor (reload)', () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    const { store } = renderTabLock(fake.factory);
    // No id yet (mimics rehydrate not landed).
    expect(fake.claims).toEqual([]);

    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });

    expect(fake.claims).toEqual(['p1']);
  });

  it('flags protocolOpenElsewhere when the lock loses exclusivity', () => {
    const fake = makeFakeLock();
    mockLocation.mockReturnValue('/protocol');
    const { store } = renderTabLock(fake.factory);
    act(() => {
      store.dispatch(setActiveProtocolId('p1'));
    });
    expect(getProtocolOpenElsewhere(store.getState())).toBe(false);

    act(() => {
      fake.fireExclusivity(false);
    });
    expect(getProtocolOpenElsewhere(store.getState())).toBe(true);

    act(() => {
      fake.fireExclusivity(true);
    });
    expect(getProtocolOpenElsewhere(store.getState())).toBe(false);
  });

  it('closes the lock on unmount', () => {
    const fake = makeFakeLock();
    const { unmount } = renderTabLock(fake.factory);

    unmount();

    expect(fake.closed).toBe(1);
  });
});
