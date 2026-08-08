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
  /**
   * Called when the gesture stops being a still hold — the pointer moved far
   * enough to be a drag, or the page scrolled underneath it. Fires whether or
   * not the hold had already produced anything, so a caller can withdraw what
   * it did. Releasing the pointer is not an interruption: a hold that ran its
   * course is meant to leave its result on screen to be read.
   */
  onHoldInterrupted?: () => void;
  enabled?: boolean;
  holdDuration?: number;
  feedbackDelay?: number;
};

type UseLongPressResult = {
  /**
   * Returns false when the event was ignored because another pointer already
   * owns the gesture, so a caller can leave that gesture's results alone
   * rather than treating every touch as the start of something new.
   */
  onPointerDown: (event: React.PointerEvent) => boolean;
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
  onHoldInterrupted,
  enabled = true,
  holdDuration = DEFAULT_HOLD_DURATION,
  feedbackDelay = DEFAULT_FEEDBACK_DELAY,
}: UseLongPressOptions): UseLongPressResult {
  const timerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const expiryTimerRef = useRef<number | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const heldRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const [isHolding, setIsHolding] = useState(false);

  /**
   * Stops the hold counting down without giving up the gesture: the finger is
   * still down, and its eventual release still has to be seen.
   */
  const abandonHold = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setIsHolding(false);
  }, []);

  /** Drops everything, leaving no timer or listener behind. */
  const teardown = useCallback(() => {
    abandonHold();
    activePointerRef.current = null;
    detachRef.current?.();
    detachRef.current = null;
    if (expiryTimerRef.current !== null) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, [abandonHold]);

  const endGesture = useCallback(() => {
    teardown();

    // A click belonging to this gesture arrives synchronously, before a
    // macrotask can run. A suppression still set after one therefore has no
    // click coming — the sequence was cancelled, or released away from the
    // node — and must not lie in wait for whatever activates the node next,
    // which may be a key press that never went near a pointer.
    expiryTimerRef.current = window.setTimeout(() => {
      expiryTimerRef.current = null;
      heldRef.current = false;
    }, 0);
  }, [teardown]);

  useEffect(() => teardown, [teardown]);

  // A hold that is no longer applicable — because the label now fits, or the
  // node became disabled — must not still be counting down towards firing,
  // nor leave a suppression behind for an activation it has nothing to do with.
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
    if (enabled) return;
    teardown();
    heldRef.current = false;
  }, [enabled, teardown]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // A second finger landing mid-gesture belongs to nobody: the drag system
      // ignores it too, so tearing the hold down here would discard a
      // suppression the first finger's release still needs.
      if (activePointerRef.current !== null) return false;

      teardown();
      heldRef.current = false;
      // A fresh gesture either way — it simply will not become a hold.
      if (!enabled || event.button !== 0) return true;

      // Only the finger that began the hold can abandon or end it. On a tablet
      // a second finger moving or lifting elsewhere would otherwise disturb a
      // hold the participant is still patiently keeping still.
      const { pointerId } = event;
      activePointerRef.current = pointerId;

      const origin = { x: event.clientX, y: event.clientY };

      const handleMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const dx = moveEvent.clientX - origin.x;
        const dy = moveEvent.clientY - origin.y;
        // Abandons the hold but keeps the gesture, so the release that ends it
        // is still seen and can expire any suppression already raised.
        if (Math.hypot(dx, dy) < DRAG_CANCEL_DISTANCE) return;
        abandonHold();
        onHoldInterrupted?.();
      };

      const handleEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        endGesture();
      };

      const handleScroll = () => {
        abandonHold();
        onHoldInterrupted?.();
      };

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

      return true;
    },
    [
      abandonHold,
      enabled,
      endGesture,
      feedbackDelay,
      holdDuration,
      onHoldInterrupted,
      onLongPress,
      teardown,
    ],
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
