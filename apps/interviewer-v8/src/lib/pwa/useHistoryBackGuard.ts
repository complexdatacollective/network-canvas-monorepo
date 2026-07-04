import { useCallback, useEffect, useRef } from 'react';

// The pinned entry is tagged so we can tell ours apart from a normal history
// entry — both on the popstate re-push and when the gated exit unwinds it.
type SentinelState = { ncBackGuard?: boolean } | null;

function isSentinel(state: unknown): boolean {
  return (state as SentinelState)?.ncBackGuard === true;
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
export function useHistoryBackGuard(
  active: boolean,
): (goHome: () => void) => void {
  const armedRef = useRef(false);

  useEffect(() => {
    if (!active) return;
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

  return useCallback((goHome: () => void) => {
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
    // history.back() is async (it schedules a popstate). Run goHome once the pop
    // lands, with a short timer as a safety net so the exit can never hang if
    // the popstate doesn't fire (e.g. no entry below ours).
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', afterPop);
      clearTimeout(timer);
      goHome();
    };
    function afterPop() {
      finish();
    }
    window.addEventListener('popstate', afterPop);
    const timer = setTimeout(finish, 50);
    window.history.back();
  }, []);
}
