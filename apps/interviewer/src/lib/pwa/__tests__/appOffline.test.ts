import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LegacyInterviewerOffline } from '../legacyInterviewerOffline';

const legacy = vi.hoisted(() => ({
  current: 'not-bundled' as LegacyInterviewerOffline,
}));
vi.mock('../legacyInterviewerOffline', () => ({
  useLegacyInterviewerOffline: () => legacy.current,
}));

const { combineAppOffline, refreshAppOffline, resetAppOffline, useAppOffline } =
  await import('../appOffline');

const stubRegistration = (
  registration: Partial<ServiceWorkerRegistration> | undefined,
) => {
  const getRegistration = vi.fn(() => Promise.resolve(registration));
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration },
  });
  return getRegistration;
};

const ownScope = `${window.location.origin}/`;

beforeEach(() => {
  legacy.current = 'not-bundled';
  resetAppOffline();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('combineAppOffline', () => {
  it('is one answer for the whole app: ready only when everything is', () => {
    expect(combineAppOffline('ready', 'not-bundled')).toBe('ready');
    expect(combineAppOffline('ready', 'ready')).toBe('ready');
    // Interviewer 8 still downloading: no protocol counts as ready offline.
    expect(combineAppOffline('ready', 'not-ready')).toBe('not-ready');
    expect(combineAppOffline('not-ready', 'ready')).toBe('not-ready');
    expect(combineAppOffline('not-ready', 'checking')).toBe('not-ready');
    expect(combineAppOffline('checking', 'ready')).toBe('checking');
    expect(combineAppOffline('ready', 'checking')).toBe('checking');
  });
});

describe('useAppOffline', () => {
  it('is ready once this app’s own worker is active', async () => {
    const getRegistration = stubRegistration({
      scope: ownScope,
      active: {} as ServiceWorker,
    });
    const { result } = renderHook(() => useAppOffline());
    await waitFor(() => expect(result.current).toBe('ready'));
    expect(getRegistration).toHaveBeenCalledWith('/');
  });

  it('is not ready while Interviewer 8 is not, though this app is', async () => {
    legacy.current = 'not-ready';
    stubRegistration({ scope: ownScope, active: {} as ServiceWorker });
    const { result } = renderHook(() => useAppOffline());
    await act(() => refreshAppOffline());
    expect(result.current).toBe('not-ready');
  });

  it('is not ready while this app’s worker is still installing', async () => {
    const installing = new EventTarget() as ServiceWorker;
    stubRegistration({ scope: ownScope, installing });
    const { result } = renderHook(() => useAppOffline());
    await act(() => refreshAppOffline());
    expect(result.current).toBe('not-ready');
  });

  it('is not ready with only another scope’s worker, or none', async () => {
    stubRegistration({
      scope: `${window.location.origin}/v8/`,
      active: {} as ServiceWorker,
    });
    const { result } = renderHook(() => useAppOffline());
    await act(() => refreshAppOffline());
    expect(result.current).toBe('not-ready');

    stubRegistration(undefined);
    await act(() => refreshAppOffline());
    expect(result.current).toBe('not-ready');
  });
});
