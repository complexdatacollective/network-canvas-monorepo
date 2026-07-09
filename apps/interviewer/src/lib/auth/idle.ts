import { useEffect, useRef } from 'react';

const DEFAULT_ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousedown',
  'mousemove',
  'keydown',
  'touchstart',
  'wheel',
];

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

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled, timeoutMs]);
}
