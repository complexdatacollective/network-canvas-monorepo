import { useCallback, useEffect, useRef } from 'react';

// The pinned entry is tagged so we can tell ours apart from a normal history
// entry — both on the popstate re-push and when the gated exit unwinds it.
function isSentinel(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'ncBackGuard' in state &&
    state.ncBackGuard === true
  );
}

// Pin the history while a sensitive screen (an interview) is mounted so a
// history-back (browser button, macOS two-finger swipe, iPadOS edge swipe —
// gestures the wheel guard and overscroll CSS can't always intercept) is inert
// instead of leaving the screen without its exit gate. On mount we push one
// tagged sentinel entry; a back that pops it is re-pushed by the popstate
// handler.
//
// The gated forward exit must go through the returned `exitTo` so the sentinel
// (and the interview entry beneath it) are consumed — otherwise they stay
// buried in the stack and a later Back from Home re-enters the interview. On an
// idle-lock/unlock remount the route tears down without exiting, so we leave the
// sentinel in place and the next mount reuses it (guarded below) rather than
// stacking a second one.
// How long one step of an exit that steps over a departed frame's entries
// waits for this window's popstate before it takes that step to have been one
// such entry (see `stepOverFrameEntries`).
const FRAME_ENTRY_STEP_MS = 250;

type ExitOptions = {
  /**
   * Entries an iframe pushed may lie above the sentinel (Interviewer 8 hosted
   * by the interview route pins its own). Once that frame is gone, a step back
   * over one changes nothing this window shows and fires no popstate here, so
   * a step that brings none within a moment is followed by another, at most
   * once per entry in the history, until a popstate lands below the sentinel.
   */
  stepOverFrameEntries?: boolean;
};

export function useHistoryBackGuard(
  active: boolean,
): (goHome: () => void, options?: ExitOptions) => void {
  const armedRef = useRef(false);

  useEffect(() => {
    if (!active) return undefined;
    const url = window.location.href;
    // Reuse an existing sentinel (e.g. left by a lock/unlock remount of the same
    // route) instead of stacking another.
    if (!isSentinel(window.history.state)) {
      window.history.pushState({ ncBackGuard: true }, '', url);
    }
    armedRef.current = true;
    const onPopState = () => {
      if (armedRef.current) {
        window.history.pushState({ ncBackGuard: true }, '', url);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // Stop re-pinning. We deliberately do NOT pop here: an exit already
      // unwound via exitTo, and a lock/unlock teardown must leave the sentinel
      // for the remount to reuse. Popping here would race the remount's push.
      armedRef.current = false;
    };
  }, [active]);

  return useCallback((goHome: () => void, options?: ExitOptions) => {
    // Disarm first so the unwinding pop doesn't trigger a re-pin. If we're on
    // our sentinel, pop it (revealing the interview entry beneath), then replace
    // that entry with Home via goHome — this removes both our sentinel and the
    // interview entry so Back from Home can't re-enter. If the sentinel isn't
    // current (a forward navigation already moved past it), just go Home.
    armedRef.current = false;
    if (!isSentinel(window.history.state)) {
      goHome();
      return;
    }
    // history.back() is async (it schedules a popstate). Run goHome only once
    // the pop lands, so `navigate('/', { replace: true })` replaces the interview
    // entry beneath the sentinel — not the sentinel while the traversal is still
    // in flight. There is always an entry below the sentinel (the guard pushed it
    // on top of the interview entry), so the popstate is guaranteed to fire.
    if (!options?.stepOverFrameEntries) {
      window.addEventListener('popstate', () => goHome(), { once: true });
      window.history.back();
      return;
    }
    let steps = 0;
    let timer: number | undefined;
    const finish = () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', onPopState);
      goHome();
    };
    const step = () => {
      window.clearTimeout(timer);
      if (steps >= window.history.length) {
        finish();
        return;
      }
      steps += 1;
      timer = window.setTimeout(step, FRAME_ENTRY_STEP_MS);
      window.history.back();
    };
    function onPopState() {
      // Still a sentinel (one stacked by a re-pin): keep going down.
      if (isSentinel(window.history.state)) step();
      else finish();
    }
    window.addEventListener('popstate', onPopState);
    step();
  }, []);
}
