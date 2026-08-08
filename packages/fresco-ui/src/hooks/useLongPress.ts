'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Matches the activation distance used by the canvas and the shared DnD drag
 * sources, so any movement that could begin a drag abandons the hold first.
 */
const DRAG_CANCEL_DISTANCE = 5;

/** Press-and-hold duration used by both iOS and Android. */
const DEFAULT_HOLD_DURATION = 500;

type UseLongPressOptions = {
  /** Called once the pointer has been held still for `holdDuration`. */
  onLongPress: () => void;
  enabled?: boolean;
  holdDuration?: number;
};

type UseLongPressResult = {
  onPointerDown: (event: React.PointerEvent) => void;
  /**
   * Whether the click following the current gesture should be swallowed,
   * consuming the flag so it reports true only once per hold.
   */
  shouldSuppressClick: () => boolean;
};

/**
 * Detects a press-and-hold that stays still, without claiming any gesture a
 * drag system needs: movement past the drag threshold, release, cancellation,
 * or a scroll all abandon the hold before it fires.
 */
export function useLongPress({
  onLongPress,
  enabled = true,
  holdDuration = DEFAULT_HOLD_DURATION,
}: UseLongPressOptions): UseLongPressResult {
  const timerRef = useRef<number | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const heldRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    detachRef.current?.();
    detachRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      cancel();
      heldRef.current = false;
      if (!enabled || event.button !== 0) return;

      const origin = { x: event.clientX, y: event.clientY };

      const handleMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - origin.x;
        const dy = moveEvent.clientY - origin.y;
        if (Math.hypot(dx, dy) >= DRAG_CANCEL_DISTANCE) cancel();
      };

      // Listening on the window rather than the node keeps the hold correct
      // once a drag system has taken pointer capture, and catches releases
      // that happen away from the node.
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', cancel);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('scroll', cancel, true);

      detachRef.current = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', cancel);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('scroll', cancel, true);
      };

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        heldRef.current = true;
        onLongPress();
      }, holdDuration);
    },
    [cancel, enabled, holdDuration, onLongPress],
  );

  const shouldSuppressClick = useCallback(() => {
    const held = heldRef.current;
    heldRef.current = false;
    return held;
  }, []);

  return { onPointerDown, shouldSuppressClick };
}
