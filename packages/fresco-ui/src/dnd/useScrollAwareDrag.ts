'use client';

import type React from 'react';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { type ScrollAxes, useScrollAxes } from '../ScrollArea';

/**
 * How long a still press on a drag source must last before movement along
 * the region's scroll axis drags it instead of scrolling the region.
 */
export const SCROLL_AXIS_DRAG_HOLD = 300;

/**
 * Outside any `ScrollArea` nothing says what scrolls. The page itself may
 * scroll vertically, so that pan stays with the browser.
 */
const PAGE_AXES: ScrollAxes = { x: false, y: true };

/**
 * Movement within this angle of a scroll axis scrolls; anything steeper
 * drags. Leaning towards the drag lets a participant aim diagonally out of a
 * scrolling region, at a drop target off to one side.
 */
const SCROLL_CONE = Math.tan((30 * Math.PI) / 180);

/**
 * Leaves the browser exactly the pans the region can perform. Touch behaviour
 * is fixed when the finger lands, so this has to be in place before any
 * gesture starts — it cannot be switched once a drag is under way.
 */
const touchActionFor = ({ x, y }: ScrollAxes): CSSProperties['touchAction'] => {
  if (x && y) return 'pan-x pan-y';
  if (x) return 'pan-x';
  if (y) return 'pan-y';
  return 'none';
};

/** Whether movement by (dx, dy) runs along an axis the region scrolls. */
const runsAlongScrollAxis = ({ x, y }: ScrollAxes, dx: number, dy: number) => {
  // A region scrolling both ways pans in every direction.
  if (x && y) return true;
  if (x) return Math.abs(dy) <= Math.abs(dx) * SCROLL_CONE;
  if (y) return Math.abs(dx) <= Math.abs(dy) * SCROLL_CONE;
  return false;
};

type ScrollAwareDrag = {
  /** The `touch-action` the drag source must carry before a gesture starts. */
  touchAction: CSSProperties['touchAction'];
  /** Whether a completed hold has freed the drag to move in any direction. */
  isArmed: boolean;
  /** Attach to the drag source's element. */
  ref: (element: HTMLElement | null) => void;
  /** Starts a gesture. Call from the drag source's pointerdown. */
  begin: (event: React.PointerEvent) => void;
  /**
   * Decides movement that has crossed the drag distance. True when the drag
   * owns it, and from then on the gesture is not scrolled. False when the
   * movement runs along an axis the region scrolls: the browser takes the
   * gesture, and will cancel the pointer sequence as it starts scrolling. A
   * later move that turns out to run across the scroll axis can still drag.
   */
  claimsMove: (dx: number, dy: number) => boolean;
  /** Ends the gesture, whatever it became. */
  end: () => void;
};

/**
 * Shares a touch gesture on a drag source with the scroll regions around it
 * (the enclosing `ScrollArea`s). Movement along an axis they can scroll
 * scrolls them; movement in any other direction drags. Where nothing can
 * scroll, every direction drags. Holding still for `SCROLL_AXIS_DRAG_HOLD`
 * first lets the drag go in any direction, for drags that have to travel
 * along the scroll axis.
 *
 * Mouse input never scrolls by dragging, so a mouse drag starts in any
 * direction regardless.
 */
export function useScrollAwareDrag(): ScrollAwareDrag {
  const scrollAxes = useScrollAxes() ?? PAGE_AXES;
  const scrollAxesRef = useRef(scrollAxes);
  scrollAxesRef.current = scrollAxes;

  // The axes the browser was given when the finger landed. The gesture is
  // decided against these, not whatever the region measures mid-gesture,
  // because the browser's `touch-action` is fixed at that moment too.
  const gestureAxesRef = useRef<ScrollAxes | null>(null);
  // Whether the current gesture belongs to the drag, so the browser must not
  // scroll for it. Set by a completed hold or by movement the drag claims.
  const claimedRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const [isArmed, setIsArmed] = useState(false);

  const clearHold = useCallback(() => {
    if (holdTimerRef.current === null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }, []);

  const end = useCallback(() => {
    clearHold();
    claimedRef.current = false;
    gestureAxesRef.current = null;
    setIsArmed(false);
  }, [clearHold]);

  useEffect(() => end, [end]);

  // `touch-action` cannot stop a pan the region allows, but cancelling the
  // gesture's touchmove can, as long as the pan has not begun. The listener
  // has to be registered before the finger lands — a browser decides at
  // touchstart whether a sequence's moves can be cancelled at all — and
  // non-passive, which React's touch props are not.
  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (claimedRef.current && event.cancelable) event.preventDefault();
  }, []);

  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (elementRef.current === element) return;
      elementRef.current?.removeEventListener('touchmove', handleTouchMove);
      elementRef.current = element;
      element?.addEventListener('touchmove', handleTouchMove, {
        passive: false,
      });
    },
    [handleTouchMove],
  );

  const begin = useCallback(
    (event: React.PointerEvent) => {
      end();
      // Mouse movement never scrolls, so a mouse gesture has no axes to share.
      if (event.pointerType === 'mouse') return;
      const axes = scrollAxesRef.current;
      gestureAxesRef.current = axes;
      if (!axes.x && !axes.y) return;

      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        claimedRef.current = true;
        setIsArmed(true);
      }, SCROLL_AXIS_DRAG_HOLD);
    },
    [end],
  );

  const claimsMove = useCallback(
    (dx: number, dy: number) => {
      // Movement ends the hold either way: a hold is a still press.
      clearHold();
      const axes = gestureAxesRef.current;
      if (!claimedRef.current && axes && runsAlongScrollAxis(axes, dx, dy)) {
        return false;
      }
      claimedRef.current = true;
      return true;
    },
    [clearHold],
  );

  return {
    touchAction: touchActionFor(scrollAxes),
    isArmed,
    ref,
    begin,
    claimsMove,
    end,
  };
}
