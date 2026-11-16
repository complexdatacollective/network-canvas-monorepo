import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useNow } from '../useNow.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('the current time a screen renders from', () => {
  it('is the time at mount, and moves on by the interval so a passed deadline takes effect', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));
    const { result } = renderHook(() => useNow(60_000));
    const mounted = Date.parse('2026-10-01T00:00:00.000Z');
    expect(result.current).toBe(mounted);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(mounted + 60_000);
  });

  it('stops ticking when the screen goes away', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useNow(60_000));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
