import { afterEach, describe, expect, it, vi } from 'vitest';

import { initSwipeNavigationGuard } from '../swipeNavigationGuard';

function stubNavigator({ chromium }: { chromium: boolean }) {
  vi.stubGlobal('navigator', {
    ...navigator,
    platform: 'MacIntel',
    maxTouchPoints: 0,
    ...(chromium ? { userAgentData: {} } : {}),
  });
}

function dispatchWheel(target: EventTarget, init: WheelEventInit): WheelEvent {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

// A fake horizontally-scrollable element: jsdom has no layout, so scroll
// metrics are defined directly.
function scrollableDiv({ scrollLeft }: { scrollLeft: number }): HTMLElement {
  const el = document.createElement('div');
  el.style.overflowX = 'scroll';
  Object.defineProperties(el, {
    scrollWidth: { value: 200 },
    clientWidth: { value: 100 },
    scrollLeft: { value: scrollLeft, writable: true },
  });
  document.body.appendChild(el);
  return el;
}

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('initSwipeNavigationGuard', () => {
  it('cancels horizontal-dominant wheel events with nothing to scroll (macOS WebKit)', () => {
    stubNavigator({ chromium: false });
    dispose = initSwipeNavigationGuard();
    const event = dispatchWheel(document.body, { deltaX: -30, deltaY: 2 });
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves vertical-dominant wheel events alone', () => {
    stubNavigator({ chromium: false });
    dispose = initSwipeNavigationGuard();
    const event = dispatchWheel(document.body, { deltaX: 3, deltaY: -40 });
    expect(event.defaultPrevented).toBe(false);
  });

  it('lets a scrollable ancestor consume the delta', () => {
    stubNavigator({ chromium: false });
    dispose = initSwipeNavigationGuard();
    const el = scrollableDiv({ scrollLeft: 0 });
    // Scrolling right with room to scroll: the element consumes it.
    const consumable = dispatchWheel(el, { deltaX: 30, deltaY: 0 });
    expect(consumable.defaultPrevented).toBe(false);
    // Scrolling left at the left edge: nothing can consume it — cancel, or
    // Safari would turn it into a back-navigation.
    const atEdge = dispatchWheel(el, { deltaX: -30, deltaY: 0 });
    expect(atEdge.defaultPrevented).toBe(true);
  });

  it('does not install on Chromium (overscroll-behavior CSS handles it)', () => {
    stubNavigator({ chromium: true });
    dispose = initSwipeNavigationGuard();
    const event = dispatchWheel(document.body, { deltaX: -30, deltaY: 0 });
    expect(event.defaultPrevented).toBe(false);
  });
});
