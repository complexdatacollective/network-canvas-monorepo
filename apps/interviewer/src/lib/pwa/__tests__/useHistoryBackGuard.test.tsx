import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHistoryBackGuard } from '../useHistoryBackGuard';

afterEach(() => {
  vi.restoreAllMocks();
  // Reset the current entry's state so a sentinel set in one test doesn't leak.
  window.history.replaceState(null, '');
});

describe('useHistoryBackGuard', () => {
  it('pins the history with a tagged sentinel and re-pushes on pop', () => {
    const pushState = vi
      .spyOn(window.history, 'pushState')
      .mockImplementation(() => {});

    const { unmount } = renderHook(() => useHistoryBackGuard(true));
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledWith(
      { ncBackGuard: true },
      '',
      window.location.href,
    );

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(pushState).toHaveBeenCalledTimes(2);

    // After unmount the guard stops re-pinning.
    unmount();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(pushState).toHaveBeenCalledTimes(2);
  });

  it('reuses an existing sentinel rather than stacking another', () => {
    // Simulate a lock/unlock remount that left our sentinel as the current entry.
    window.history.replaceState({ ncBackGuard: true }, '');
    const pushState = vi
      .spyOn(window.history, 'pushState')
      .mockImplementation(() => {});

    renderHook(() => useHistoryBackGuard(true));
    expect(pushState).not.toHaveBeenCalled();
  });

  it('does nothing while inactive', () => {
    const pushState = vi
      .spyOn(window.history, 'pushState')
      .mockImplementation(() => {});

    renderHook(() => useHistoryBackGuard(false));
    expect(pushState).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(pushState).not.toHaveBeenCalled();
  });

  it('exit runs the navigation directly when not on a sentinel', () => {
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    // Inactive so no sentinel is pushed; state stays non-sentinel.
    const { result } = renderHook(() => useHistoryBackGuard(false));
    const goHome = vi.fn();
    result.current(goHome);

    expect(back).not.toHaveBeenCalled();
    expect(goHome).toHaveBeenCalledTimes(1);
  });

  it('exit consumes the sentinel with a back(), then runs the navigation on pop', () => {
    window.history.replaceState({ ncBackGuard: true }, '');
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    const { result } = renderHook(() => useHistoryBackGuard(true));
    const goHome = vi.fn();
    result.current(goHome);

    // Pops our sentinel first and waits for the resulting popstate.
    expect(back).toHaveBeenCalledTimes(1);
    expect(goHome).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(goHome).toHaveBeenCalledTimes(1);
  });

  describe('stepping over a departed frame’s entries', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('steps back again while no popstate comes, and replaces only the entry below the sentinel', () => {
      vi.useFakeTimers();
      // Room in the history for the steps below.
      for (let i = 0; i < 4; i++) window.history.pushState(null, '');
      window.history.replaceState({ ncBackGuard: true }, '');
      vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
      const back = vi
        .spyOn(window.history, 'back')
        .mockImplementation(() => {});

      const { result } = renderHook(() => useHistoryBackGuard(false));
      const goHome = vi.fn();
      result.current(goHome, { stepOverFrameEntries: true });
      expect(back).toHaveBeenCalledTimes(1);

      // Two steps over entries the frame pushed: no popstate here.
      vi.advanceTimersByTime(250);
      expect(back).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(250);
      expect(back).toHaveBeenCalledTimes(3);
      expect(goHome).not.toHaveBeenCalled();

      // The next step reaches this window's entry below the sentinel.
      window.history.replaceState(null, '');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(goHome).toHaveBeenCalledTimes(1);

      // Done: no further steps.
      vi.advanceTimersByTime(1_000);
      expect(back).toHaveBeenCalledTimes(3);
    });

    it('goes home after at most one step per history entry', () => {
      vi.useFakeTimers();
      window.history.replaceState({ ncBackGuard: true }, '');
      vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
      const back = vi
        .spyOn(window.history, 'back')
        .mockImplementation(() => {});

      const { result } = renderHook(() => useHistoryBackGuard(false));
      const goHome = vi.fn();
      result.current(goHome, { stepOverFrameEntries: true });
      vi.advanceTimersByTime(250 * (window.history.length + 1));

      expect(back).toHaveBeenCalledTimes(window.history.length);
      expect(goHome).toHaveBeenCalledTimes(1);
    });
  });
});
