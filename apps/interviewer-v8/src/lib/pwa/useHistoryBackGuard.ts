import { useEffect } from 'react';

// Pin the history while a sensitive screen is mounted: push a duplicate entry
// on mount and re-push whenever it pops, so a history-back (browser button,
// macOS two-finger swipe, iPadOS edge swipe — gestures the wheel guard and
// overscroll CSS can't always intercept) is inert instead of leaving the
// screen. Forward navigation (the screen's own gated exit) is unaffected.
export function useHistoryBackGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const url = window.location.href;
    window.history.pushState(null, '', url);
    const onPopState = () => {
      window.history.pushState(null, '', url);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [active]);
}
