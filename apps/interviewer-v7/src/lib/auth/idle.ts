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
  lockOnBlurMs?: number | null;
};

export function useIdleTimer({
  timeoutMs,
  enabled,
  onIdle,
  lockOnBlurMs,
}: IdleTimerOptions): void {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;
    let idleTimer: number | undefined;
    let blurTimer: number | undefined;

    const fireIdle = () => {
      onIdleRef.current();
    };

    const resetIdle = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(fireIdle, timeoutMs);
    };

    const handleBlur = () => {
      if (lockOnBlurMs === null || lockOnBlurMs === undefined) return;
      if (blurTimer !== undefined) window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(fireIdle, lockOnBlurMs);
    };

    const handleFocus = () => {
      if (blurTimer !== undefined) {
        window.clearTimeout(blurTimer);
        blurTimer = undefined;
      }
      resetIdle();
    };

    const handleVisibility = () => {
      if (document.hidden) {
        handleBlur();
      } else {
        handleFocus();
      }
    };

    for (const evt of DEFAULT_ACTIVITY_EVENTS) {
      window.addEventListener(evt, resetIdle, { passive: true });
    }
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    resetIdle();

    return () => {
      for (const evt of DEFAULT_ACTIVITY_EVENTS) {
        window.removeEventListener(evt, resetIdle);
      }
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      if (blurTimer !== undefined) window.clearTimeout(blurTimer);
    };
  }, [enabled, timeoutMs, lockOnBlurMs]);
}
