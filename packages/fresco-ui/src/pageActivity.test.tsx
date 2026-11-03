import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePageActive } from './pageActivity';

// One emulated window: whether the document is visible and whether the window
// has focus. Changes dispatch the events a browser would.
let visibility: DocumentVisibilityState = 'visible';
let focused = true;

beforeEach(() => {
  visibility = 'visible';
  focused = true;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The blur check waits a task, as it does in a browser, so the helper does too.
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

async function emulateWindow(next: { visible?: boolean; focused?: boolean }) {
  await act(async () => {
    if (next.visible !== undefined) {
      visibility = next.visible ? 'visible' : 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    }
    if (next.focused !== undefined) {
      focused = next.focused;
      window.dispatchEvent(new Event(next.focused ? 'focus' : 'blur'));
    }
    await nextTask();
  });
}

describe('usePageActive', () => {
  it('is true only while the page is visible and its window focused', async () => {
    const { result } = renderHook(() => usePageActive());
    expect(result.current).toBe(true);

    await emulateWindow({ focused: false });
    expect(result.current).toBe(false);

    await emulateWindow({ focused: true, visible: false });
    expect(result.current).toBe(false);

    await emulateWindow({ visible: true });
    expect(result.current).toBe(true);
  });

  it('is false at mount on a page that is not in front of the user', () => {
    focused = false;
    const { result } = renderHook(() => usePageActive());
    expect(result.current).toBe(false);
  });

  it('stays true through a blur that leaves the page focused', async () => {
    // Focus moving into a frame on the page blurs the window, but the page as
    // a whole keeps focus. `hasFocus()` lags behind the blur event and has
    // caught up by the next task.
    const { result } = renderHook(() => usePageActive());

    // React renders whatever the blur handler reported before focus catches up.
    await act(async () => {
      focused = false;
      window.dispatchEvent(new Event('blur'));
    });
    focused = true;
    await act(nextTask);

    expect(result.current).toBe(true);
  });

  it('ignores focus inside a frame, whose page decides', async () => {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    const { result } = renderHook(() => usePageActive());

    await emulateWindow({ focused: false });
    expect(result.current).toBe(true);

    await emulateWindow({ visible: false });
    expect(result.current).toBe(false);
  });
});
