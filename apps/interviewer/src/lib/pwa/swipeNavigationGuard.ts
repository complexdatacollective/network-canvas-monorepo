// Safari on macOS ignores `overscroll-behavior-x` for its two-finger history
// swipe (WebKit bug 240183), so the gesture has to be suppressed at the wheel
// level: cancel horizontal-dominant wheel events unless an ancestor can
// actually consume them by scrolling. Chromium honours the CSS property (see
// globals.css) and never installs this listener.
//
// Returns a disposer (used by tests; the app installs the guard for the
// lifetime of the page).
export function initSwipeNavigationGuard(): () => void {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  const isMac =
    navigator.platform.startsWith('Mac') && navigator.maxTouchPoints === 0;
  const isChromium = 'userAgentData' in navigator;
  if (!isMac || isChromium) return () => {};

  const onWheel = (event: WheelEvent) => {
    if (!event.cancelable) return;
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    if (hasHorizontalScrollCapacity(event.target, event.deltaX)) return;
    event.preventDefault();
  };
  // Wheel listeners default to passive on the document; preventDefault needs
  // an explicitly non-passive one.
  document.addEventListener('wheel', onWheel, { passive: false });
  return () => document.removeEventListener('wheel', onWheel);
}

// Whether any ancestor of `target` can still consume a horizontal wheel delta
// by scrolling — mirroring the check the browser itself would make before
// treating the gesture as overscroll (and thus as a navigation swipe).
function hasHorizontalScrollCapacity(
  target: EventTarget | null,
  deltaX: number,
): boolean {
  let el = target instanceof Element ? target : null;
  while (el) {
    if (el instanceof HTMLElement) {
      const { overflowX } = getComputedStyle(el);
      const scrollable =
        (overflowX === 'auto' || overflowX === 'scroll') &&
        el.scrollWidth > el.clientWidth;
      if (scrollable) {
        if (deltaX < 0 && el.scrollLeft > 0) return true;
        if (deltaX > 0 && el.scrollLeft < el.scrollWidth - el.clientWidth - 1) {
          return true;
        }
      }
    }
    el = el.parentElement;
  }
  return false;
}
