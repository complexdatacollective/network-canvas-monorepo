import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePageActive } from './pageActivity';

// One emulated window: whether the document is visible and whether the window
// has focus. Changes dispatch the events a browser would.
let visibility: DocumentVisibilityState = 'visible';
let focused = true;

beforeEach(() => {
  // The hook re-checks focus a task after a blur. Fake timers decide exactly
  // when that task runs, so no test depends on how busy the machine is.
  vi.useFakeTimers();
  visibility = 'visible';
  focused = true;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function emulateWindow(next: { visible?: boolean; focused?: boolean }) {
  act(() => {
    if (next.visible !== undefined) {
      visibility = next.visible ? 'visible' : 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    }
    if (next.focused !== undefined) {
      focused = next.focused;
      window.dispatchEvent(new Event(next.focused ? 'focus' : 'blur'));
    }
  });
  act(() => {
    vi.runOnlyPendingTimers();
  });
}

describe('usePageActive', () => {
  it('is true only while the page is visible and its window focused', () => {
    const { result } = renderHook(() => usePageActive());
    expect(result.current).toBe(true);

    emulateWindow({ focused: false });
    expect(result.current).toBe(false);

    emulateWindow({ focused: true, visible: false });
    expect(result.current).toBe(false);

    emulateWindow({ visible: true });
    expect(result.current).toBe(true);
  });

  it('is false at mount on a page that is not in front of the user', () => {
    focused = false;
    const { result } = renderHook(() => usePageActive());
    expect(result.current).toBe(false);
  });

  it('stays true through a blur that leaves the page focused', () => {
    // Focus moving into a frame on the page blurs the window, but the page as
    // a whole keeps focus. `hasFocus()` lags behind the blur event and has
    // caught up by the time the deferred re-check runs.
    const { result } = renderHook(() => usePageActive());

    act(() => {
      focused = false;
      window.dispatchEvent(new Event('blur'));
    });
    focused = true;
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(result.current).toBe(true);
  });

  it('ignores focus inside a frame, whose page decides', () => {
    // A null `top` is not this window, which is all the hook asks.
    vi.spyOn(window, 'top', 'get').mockReturnValue(null);
    const { result } = renderHook(() => usePageActive());

    emulateWindow({ focused: false });
    expect(result.current).toBe(true);

    emulateWindow({ visible: false });
    expect(result.current).toBe(false);
  });
});
