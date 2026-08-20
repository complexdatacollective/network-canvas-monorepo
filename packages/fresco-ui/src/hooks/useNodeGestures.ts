'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Movement past this distance stops a gesture being a tap or a hold. Shared
 * with the canvas and DnD drag systems, so any movement that could begin a
 * drag is classified the same way everywhere.
 */
const DRAG_DISTANCE = 5;

/** Press-and-hold duration used by both iOS and Android. */
const DEFAULT_HOLD_DURATION = 500;

/**
 * How long a press has to last before it is treated as a deliberate hold worth
 * giving feedback for. Ordinary taps are shorter than this, so they never
 * flash an indicator on their way past.
 */
const DEFAULT_FEEDBACK_DELAY = 150;

/**
 * How a node was activated. Pointer taps carry gesture state a keyboard press
 * has no equivalent for — held modifier keys, a place the pointer is pointing —
 * so a host cannot treat the two identically.
 */
export type ActivationSource = 'pointer' | 'keyboard';

export type NodeDragEndInfo = {
  /** True when the pointer sequence was cancelled rather than released. */
  cancelled: boolean;
};

type UseNodeGesturesOptions = {
  /** Called once the pointer has been held still for `holdDuration`. */
  onLongPress?: () => void;
  /**
   * Called when the gesture stops being a still hold — the pointer moved far
   * enough to be a drag, or the page scrolled underneath it. Fires whether or
   * not the hold had already produced anything, so a caller can withdraw what
   * it did. Releasing the pointer is not an interruption: a hold that ran its
   * course is meant to leave its result on screen to be read.
   */
  onHoldInterrupted?: () => void;
  /** Called once when movement crosses the drag distance. */
  onDragStart?: (event: PointerEvent) => void;
  /** Called for every movement of an active drag, including the first. */
  onDragMove?: (event: PointerEvent) => void;
  /** Called when an active drag releases or is cancelled. */
  onDragEnd?: (event: PointerEvent, info: NodeDragEndInfo) => void;
  /** Whether a still press should become a hold. */
  holdEnabled?: boolean;
  /** Whether movement should become a drag this recognizer owns. */
  dragEnabled?: boolean;
  disabled?: boolean;
  holdDuration?: number;
  feedbackDelay?: number;
};

type UseNodeGesturesResult = {
  /**
   * Returns false when the event was ignored because another pointer already
   * owns the gesture, so a caller can leave that gesture's results alone
   * rather than treating every touch as the start of something new.
   */
  onPointerDown: (event: React.PointerEvent) => boolean;
  /**
   * Whether the click following the current gesture should be swallowed
   * because the gesture already resolved as a hold or a drag. Consuming the
   * flag, it reports true only once per gesture.
   */
  shouldSuppressClick: () => boolean;
  /**
   * Whether a hold is underway and has already lasted long enough to be
   * deliberate. Goes false the moment the hold is abandoned or fires.
   */
  isHolding: boolean;
  /** Whether movement has crossed the drag distance and the drag is live. */
  isDragging: boolean;
  /** Milliseconds between hold feedback appearing and the hold firing. */
  feedbackDuration: number;
};

/**
 * The single gesture recognizer for a node. Owns the pointer sequence from
 * press to release and classifies it exactly once — as a tap (the native
 * click is allowed through), a hold (`onLongPress`; the click is swallowed),
 * or a drag (`onDragStart`/`Move`/`End`; the click is swallowed) — so no two
 * behaviours ever fight over the same gesture.
 *
 * Movement past the drag distance always stops the gesture being a tap: the
 * hold is abandoned and the click the browser may still synthesize on release
 * is swallowed. When `dragEnabled` is false the movement itself classifies
 * nothing further — an external drag system composing its own pointer
 * handlers on the node (e.g. `useDragSource`, which shares the same
 * threshold) owns what the movement becomes.
 */
export function useNodeGestures({
  onLongPress,
  onHoldInterrupted,
  onDragStart,
  onDragMove,
  onDragEnd,
  holdEnabled = false,
  dragEnabled = false,
  disabled = false,
  holdDuration = DEFAULT_HOLD_DURATION,
  feedbackDelay = DEFAULT_FEEDBACK_DELAY,
}: UseNodeGesturesOptions): UseNodeGesturesResult {
  const timerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const expiryTimerRef = useRef<number | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  // Whether a drag is live, and the move that last advanced it — kept in refs
  // so teardown from outside the gesture (unmount, disabling) can see them.
  const draggingRef = useRef(false);
  const lastDragEventRef = useRef<PointerEvent | null>(null);
  // The onDragEnd that was live when the drag began. A host may swap or
  // remove its handlers mid-drag (toggling repositioning off), but the
  // callback that opened the drag owns its cleanup and must see it end.
  const activeDragEndRef = useRef<
    ((event: PointerEvent, info: NodeDragEndInfo) => void) | null
  >(null);
  const [isHolding, setIsHolding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Callbacks and enablement are read through refs at the moment they matter,
  // not captured at pointer-down: a hold may stop being applicable — or a drag
  // handler may change — while the finger is down.
  const optionsRef = useRef({
    onLongPress,
    onHoldInterrupted,
    onDragStart,
    onDragMove,
    onDragEnd,
    holdEnabled,
    dragEnabled,
  });
  optionsRef.current = {
    onLongPress,
    onHoldInterrupted,
    onDragStart,
    onDragMove,
    onDragEnd,
    holdEnabled,
    dragEnabled,
  };

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

  /**
   * Ends a live drag as cancelled, notifying the callback that began it. Used
   * whenever a drag is interrupted from outside its own pointer sequence:
   * unmount, disabling, or the host withdrawing its drag handlers.
   */
  const cancelActiveDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    const lastEvent = lastDragEventRef.current;
    lastDragEventRef.current = null;
    const endActiveDrag = activeDragEndRef.current;
    activeDragEndRef.current = null;
    if (lastEvent) {
      endActiveDrag?.(lastEvent, { cancelled: true });
    }
  }, []);

  /** Drops everything, leaving no timer or listener behind. */
  const teardown = useCallback(() => {
    // A drag still live here was interrupted from outside its own pointer
    // sequence. The host's effects (a DnD item in flight, a pinned simulation
    // node) outlive this hook, so it must hear the drag end as cancelled
    // rather than never hear at all.
    cancelActiveDrag();
    abandonHold();
    activePointerRef.current = null;
    detachRef.current?.();
    detachRef.current = null;
    setIsDragging(false);
    if (expiryTimerRef.current !== null) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, [abandonHold, cancelActiveDrag]);

  const endGesture = useCallback(() => {
    teardown();

    // A click belonging to this gesture arrives synchronously, before a
    // macrotask can run. A suppression still set after one therefore has no
    // click coming — the sequence was cancelled, or released away from the
    // node — and must not lie in wait for whatever activates the node next,
    // which may be a key press that never went near a pointer.
    expiryTimerRef.current = window.setTimeout(() => {
      expiryTimerRef.current = null;
      suppressClickRef.current = false;
    }, 0);
  }, [teardown]);

  useEffect(() => teardown, [teardown]);

  // A hold that is no longer applicable — because the label now fits, or the
  // node became disabled — must not still be counting down towards firing,
  // nor leave a suppression behind for an activation it has nothing to do with.
  useEffect(() => {
    if (holdEnabled && !disabled) return;
    abandonHold();
    if (disabled) {
      teardown();
      suppressClickRef.current = false;
    }
  }, [abandonHold, disabled, holdEnabled, teardown]);

  // A host may withdraw dragging itself, mid-drag, without disabling the node
  // (toggling repositioning off). The gesture goes on — the finger is still
  // down — but the drag ends now, through the callback that began it.
  useEffect(() => {
    if (!dragEnabled) cancelActiveDrag();
  }, [cancelActiveDrag, dragEnabled]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // A second finger landing mid-gesture belongs to nobody: it must not
      // tear down a hold, end a drag, or discard a suppression the first
      // finger's release still needs.
      if (activePointerRef.current !== null) return false;

      teardown();
      suppressClickRef.current = false;
      // A fresh gesture either way — it simply cannot become a hold or drag.
      if (disabled || event.button !== 0) return true;

      // Only the finger that began the gesture can advance or end it. On a
      // tablet a second finger moving or lifting elsewhere would otherwise
      // disturb a gesture the participant still owns.
      const { pointerId } = event;
      activePointerRef.current = pointerId;

      const origin = { x: event.clientX, y: event.clientY };
      const captureTarget =
        event.currentTarget instanceof HTMLElement ? event.currentTarget : null;

      // Capture keeps fast drags delivering their moves to this node rather
      // than whatever the pointer happens to be over.
      if (optionsRef.current.dragEnabled && captureTarget) {
        try {
          captureTarget.setPointerCapture(pointerId);
        } catch {
          // The DOM may not implement pointer capture (jsdom).
        }
      }

      let moved = false;

      const handleMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;

        if (draggingRef.current) {
          lastDragEventRef.current = moveEvent;
          optionsRef.current.onDragMove?.(moveEvent);
          return;
        }

        if (moved) return;

        const dx = moveEvent.clientX - origin.x;
        const dy = moveEvent.clientY - origin.y;
        if (Math.hypot(dx, dy) < DRAG_DISTANCE) return;

        // The gesture is no longer a tap or a still hold, whatever it becomes.
        // A browser may still synthesize a click on release — a mouse released
        // within the same button does, and touch movement inside the browser's
        // own slop does — and a gesture already classified as movement must
        // not read as a tap, whether the movement becomes this recognizer's
        // drag, an external system's (which swallows its own post-drag click
        // before it reaches the node), or nothing at all.
        moved = true;
        suppressClickRef.current = true;
        abandonHold();
        optionsRef.current.onHoldInterrupted?.();

        if (optionsRef.current.dragEnabled) {
          draggingRef.current = true;
          lastDragEventRef.current = moveEvent;
          activeDragEndRef.current = optionsRef.current.onDragEnd ?? null;
          setIsDragging(true);
          optionsRef.current.onDragStart?.(moveEvent);
          optionsRef.current.onDragMove?.(moveEvent);
        }
      };

      const handleEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;

        try {
          captureTarget?.releasePointerCapture(pointerId);
        } catch {
          // Capture may already be gone, or the DOM may not implement it.
        }

        if (draggingRef.current) {
          // Settled here, before teardown, so teardown cannot mistake this
          // orderly end for an interruption and end the drag twice — and
          // through the callback that began the drag, which owns its cleanup
          // even if the host has since swapped handlers.
          draggingRef.current = false;
          lastDragEventRef.current = null;
          const endActiveDrag = activeDragEndRef.current;
          activeDragEndRef.current = null;
          endActiveDrag?.(endEvent, {
            cancelled: endEvent.type === 'pointercancel',
          });
        }

        endGesture();
      };

      const handleScroll = () => {
        // Scrolling under a still press means the gesture became a scroll:
        // abandon the hold, but a drag in flight is unaffected (its own
        // touch-action already prevents scroll). A gesture classified as a
        // scroll is not also a tap — if the node is still under the pointer
        // on release, the click the browser synthesizes must be swallowed —
        // and it is not a drag either: settling it here stops later movement
        // in the same sequence from picking the node up after the
        // participant has already scrolled it out from under their finger.
        if (draggingRef.current) return;
        moved = true;
        suppressClickRef.current = true;
        abandonHold();
        optionsRef.current.onHoldInterrupted?.();
      };

      const handleWindowBlur = () => {
        // The window lost the pointer without a pointerup or pointercancel —
        // an app switch, or a release outside the browser. Nothing else will
        // end the sequence: a live drag must still be heard ending, and the
        // gesture must give up its pointer ownership or the node would refuse
        // every later press.
        cancelActiveDrag();
        endGesture();
      };

      // Listening on the window rather than the node keeps the gesture
      // correct once an external drag system has taken pointer capture, and
      // catches releases that happen away from the node.
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleEnd);
      window.addEventListener('pointercancel', handleEnd);
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('blur', handleWindowBlur);

      detachRef.current = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleEnd);
        window.removeEventListener('pointercancel', handleEnd);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('blur', handleWindowBlur);
      };

      if (optionsRef.current.holdEnabled) {
        feedbackTimerRef.current = window.setTimeout(() => {
          feedbackTimerRef.current = null;
          if (!optionsRef.current.holdEnabled || moved) return;
          setIsHolding(true);
        }, feedbackDelay);

        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          // Re-checked rather than trusted from pointer-down: the hold may
          // have stopped being applicable while the finger was down.
          if (!optionsRef.current.holdEnabled || moved) return;
          suppressClickRef.current = true;
          // Whatever the hold produced is the feedback from here on.
          setIsHolding(false);
          optionsRef.current.onLongPress?.();
        }, holdDuration);
      }

      return true;
    },
    [
      abandonHold,
      cancelActiveDrag,
      disabled,
      endGesture,
      feedbackDelay,
      holdDuration,
      teardown,
    ],
  );

  const shouldSuppressClick = useCallback(() => {
    const suppressed = suppressClickRef.current;
    suppressClickRef.current = false;
    return suppressed;
  }, []);

  return {
    onPointerDown,
    shouldSuppressClick,
    isHolding,
    isDragging,
    feedbackDuration: Math.max(holdDuration - feedbackDelay, 0),
  };
}
