'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Matches the activation distance used by the canvas and the shared DnD drag
 * sources, so any movement that could begin a drag abandons the hold first.
 */
const DRAG_CANCEL_DISTANCE = 5;

/** Press-and-hold duration used by both iOS and Android. */
const DEFAULT_HOLD_DURATION = 500;

/**
 * How long a press has to last before it is treated as a deliberate hold worth
 * giving feedback for. Ordinary taps are shorter than this, so they never
 * flash an indicator on their way past.
 */
const DEFAULT_FEEDBACK_DELAY = 150;

type UseLongPressOptions = {
  /** Called once the pointer has been held still for `holdDuration`. */
  onLongPress: () => void;
  enabled?: boolean;
  holdDuration?: number;
  feedbackDelay?: number;
};

type UseLongPressResult = {
  onPointerDown: (event: React.PointerEvent) => void;
  /**
   * Whether the click following the current gesture should be swallowed,
   * consuming the flag so it reports true only once per hold.
   */
  shouldSuppressClick: () => boolean;
  /**
   * Whether a hold is underway and has already lasted long enough to be
   * deliberate. Goes false the moment the hold is abandoned or fires.
   */
  isHolding: boolean;
  /** Milliseconds between feedback appearing and the hold firing. */
  feedbackDuration: number;
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
  feedbackDelay = DEFAULT_FEEDBACK_DELAY,
}: UseLongPressOptions): UseLongPressResult {
  const timerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const heldRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const [isHolding, setIsHolding] = useState(false);

  const cancel = useCallback(() => {
    activePointerRef.current = null;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setIsHolding(false);
    detachRef.current?.();
    detachRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  // A hold that is no longer applicable — because the label now fits, or the
  // node became disabled — must not still be counting down towards firing.
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) cancel();
  }, [cancel, enabled]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // A second finger landing mid-gesture belongs to nobody: the drag system
      // ignores it too, so tearing the hold down here would discard a
      // suppression the first finger's release still needs.
      if (activePointerRef.current !== null) return;

      cancel();
      heldRef.current = false;
      if (!enabled || event.button !== 0) return;

      // Only the finger that began the hold can abandon it. On a tablet a
      // second finger moving or lifting elsewhere would otherwise cancel a
      // hold the participant is still patiently keeping still.
      const { pointerId } = event;
      activePointerRef.current = pointerId;

      const origin = { x: event.clientX, y: event.clientY };

      const handleMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const dx = moveEvent.clientX - origin.x;
        const dy = moveEvent.clientY - origin.y;
        if (Math.hypot(dx, dy) >= DRAG_CANCEL_DISTANCE) cancel();
      };

      const handleEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        cancel();
      };

      const handleScroll = () => cancel();

      // Listening on the window rather than the node keeps the hold correct
      // once a drag system has taken pointer capture, and catches releases
      // that happen away from the node.
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleEnd);
      window.addEventListener('pointercancel', handleEnd);
      window.addEventListener('scroll', handleScroll, true);

      detachRef.current = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleEnd);
        window.removeEventListener('pointercancel', handleEnd);
        window.removeEventListener('scroll', handleScroll, true);
      };

      feedbackTimerRef.current = window.setTimeout(() => {
        feedbackTimerRef.current = null;
        if (!enabledRef.current) return;
        setIsHolding(true);
      }, feedbackDelay);

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        // Re-checked rather than trusted from pointer-down: the hold may have
        // stopped being applicable while the finger was down.
        if (!enabledRef.current) return;
        heldRef.current = true;
        // Whatever the hold produced is the feedback from here on.
        setIsHolding(false);
        onLongPress();
      }, holdDuration);
    },
    [cancel, enabled, feedbackDelay, holdDuration, onLongPress],
  );

  const shouldSuppressClick = useCallback(() => {
    const held = heldRef.current;
    heldRef.current = false;
    return held;
  }, []);

  return {
    onPointerDown,
    shouldSuppressClick,
    isHolding,
    feedbackDuration: Math.max(holdDuration - feedbackDelay, 0),
  };
}
