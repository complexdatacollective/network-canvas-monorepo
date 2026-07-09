import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useIdleTimer } from '../idle';

const TIMEOUT = 10_000;

// Wall-clock (Date.now) is mocked independently of the fake setTimeout clock so a
// frozen background tab can be simulated: `freeze` advances only the wall clock,
// `advance` moves both together (real elapsed time where timers actually fire).
let nowMs = 0;

function advance(ms: number) {
  nowMs += ms;
  vi.advanceTimersByTime(ms);
}

function freeze(ms: number) {
  nowMs += ms;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

function fireActivity() {
  window.dispatchEvent(new Event('keydown'));
}

beforeEach(() => {
  nowMs = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  setHidden(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useIdleTimer', () => {
  it('fires onIdle after the timeout elapses with no activity', () => {
    const onIdle = vi.fn();
    renderHook(() =>
      useIdleTimer({ timeoutMs: TIMEOUT, enabled: true, onIdle }),
    );

    advance(TIMEOUT - 1);
    expect(onIdle).not.toHaveBeenCalled();
    advance(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('resets the countdown on activity', () => {
    const onIdle = vi.fn();
    renderHook(() =>
      useIdleTimer({ timeoutMs: TIMEOUT, enabled: true, onIdle }),
    );

    advance(TIMEOUT - 100);
    fireActivity();
    advance(100);
    expect(onIdle).not.toHaveBeenCalled(); // only 100ms since the reset
    advance(TIMEOUT - 100);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('does nothing while enabled is false', () => {
    const onIdle = vi.fn();
    renderHook(() =>
      useIdleTimer({ timeoutMs: TIMEOUT, enabled: false, onIdle }),
    );

    advance(TIMEOUT * 3);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('locks on return when the tab was hidden past the timeout', () => {
    const onIdle = vi.fn();
    renderHook(() =>
      useIdleTimer({ timeoutMs: TIMEOUT, enabled: true, onIdle }),
    );

    setHidden(true);
    freeze(TIMEOUT + 5_000); // frozen tab: wall clock passes, setTimeout does not fire
    expect(onIdle).not.toHaveBeenCalled();

    setHidden(false);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('re-arms for the remaining time on return, locking at the original deadline', () => {
    const onIdle = vi.fn();
    renderHook(() =>
      useIdleTimer({ timeoutMs: TIMEOUT, enabled: true, onIdle }),
    );

    setHidden(true);
    freeze(TIMEOUT - 4_000); // returned 4s before the deadline
    setHidden(false);
    expect(onIdle).not.toHaveBeenCalled();

    advance(4_000 - 1);
    expect(onIdle).not.toHaveBeenCalled();
    advance(1); // reaches the original deadline, not a fresh full window
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
