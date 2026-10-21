import { useEffect, useRef, useSyncExternalStore } from 'react';

const DEFAULT_ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousedown',
  'mousemove',
  'keydown',
  'touchstart',
  'wheel',
];

// While Interviewer 9 hosts a schema 8 interview, Interviewer 8 runs in a
// same-origin iframe (components/Interviewer8Frame.tsx) and keeps its own idle
// lock there. Taps and keys inside the frame never reach this window, so this
// app's timer would lock it mid-interview; a hold switches the timer off. Once
// every hold is released the timer starts again, counting from zero.
let idleLockHolds = 0;
const idleLockHoldListeners = new Set<() => void>();

const notifyIdleLockHoldListeners = () => {
  for (const listener of idleLockHoldListeners) listener();
};

/** Suspend the idle lock until the returned release is called. */
export function holdIdleLock(): () => void {
  idleLockHolds += 1;
  notifyIdleLockHoldListeners();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    idleLockHolds -= 1;
    notifyIdleLockHoldListeners();
  };
}

const subscribeIdleLockHolds = (listener: () => void) => {
  idleLockHoldListeners.add(listener);
  return () => {
    idleLockHoldListeners.delete(listener);
  };
};

const isIdleLockHeld = () => idleLockHolds > 0;

type IdleTimerOptions = {
  timeoutMs: number;
  enabled: boolean;
  onIdle: () => void;
};

export function useIdleTimer({
  timeoutMs,
  enabled,
  onIdle,
}: IdleTimerOptions): void {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  const held = useSyncExternalStore(
    subscribeIdleLockHolds,
    isIdleLockHeld,
    isIdleLockHeld,
  );
  const running = enabled && !held;

  useEffect(() => {
    if (!running) return;
    let idleTimer: number | undefined;
    let lastActivityAt = Date.now();

    const fireIdle = () => {
      onIdleRef.current();
    };

    const resetIdle = () => {
      lastActivityAt = Date.now();
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(fireIdle, timeoutMs);
    };

    // Background tabs throttle or freeze timers, so the running idle timer can't
    // be trusted while hidden. On return, reconcile against wall-clock elapsed
    // time: lock if the idle window has already passed, otherwise re-arm for the
    // time remaining — not a fresh window, so time spent away still counts.
    const handleVisibility = () => {
      if (!document.hidden) {
        const remaining = timeoutMs - (Date.now() - lastActivityAt);
        if (idleTimer !== undefined) window.clearTimeout(idleTimer);
        if (remaining <= 0) {
          fireIdle();
        } else {
          idleTimer = window.setTimeout(fireIdle, remaining);
        }
      }
    };

    for (const evt of DEFAULT_ACTIVITY_EVENTS) {
      window.addEventListener(evt, resetIdle, { passive: true });
    }
    document.addEventListener('visibilitychange', handleVisibility);

    resetIdle();

    return () => {
      for (const evt of DEFAULT_ACTIVITY_EVENTS) {
        window.removeEventListener(evt, resetIdle);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
    };
  }, [running, timeoutMs]);
}
