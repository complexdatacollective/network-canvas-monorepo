'use client';

import { useGesture } from '@use-gesture/react';
import {
  animate,
  type AnimationPlaybackControls,
  type MotionValue,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from 'motion/react';
import { type RefObject, useCallback, useMemo, useRef, useState } from 'react';

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;
// How much of the family stays on screen, at least, however far it is
// dragged away.
const KEEP_VISIBLE = 120;
// A press that moves less than this is a click, not a drag.
const DRAG_THRESHOLD = 5;

const SPRING = { type: 'spring', stiffness: 260, damping: 32 } as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * The zoom a wheel event asks for, as a power of two. Browsers and devices
 * report wheel movement very differently: a Windows mouse notch is 100 pixels,
 * Firefox counts lines, and a macOS trackpad sends many small deltas, with a
 * pinch arriving as a wheel event with the control key held. These are the
 * weights d3-zoom uses, which make each of them feel alike: a notch is about
 * an eighth, a trackpad swipe a steady glide, a pinch tracks the fingers.
 */
function wheelZoom(event: WheelEvent) {
  const perUnit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 0.05
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? 1
        : 0.002;
  // A single event never zooms by more than half or double, whatever a
  // device's momentum reports.
  return clamp(-event.deltaY * perUnit * (event.ctrlKey ? 10 : 1), -1, 1);
}

/** Where the content sits: its offset in the viewport, and its scale. */
export type View = { x: number; y: number; scale: number };

export type PanZoom = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  /** Moves an element's centre to the middle of the viewport, or of the part
   * of it from its left edge to `visibleRight` (a client x). */
  centreOn: (
    element: HTMLElement,
    options?: { visibleRight?: number; animated?: boolean },
  ) => void;
  /** Pans just enough to bring an element fully into view. */
  bringIntoView: (element: HTMLElement) => void;
  /** Zooms by a power of two about the viewport's centre. */
  zoomBy: (exponent: number) => void;
  /** Fits an element of the content in the viewport, inside the given
   * insets, at no more than its natural size. */
  fitToView: (
    element: HTMLElement,
    insets: { top: number; right: number; bottom: number; left: number },
    options?: { animated?: boolean },
  ) => void;
  /** Keeps an element where it is on screen across a change of layout,
   * given where it was in the content before the change. */
  holdInPlace: (
    element: HTMLElement,
    previous: { x: number; y: number },
  ) => void;
  /** Where an element's centre sits in the content, unscaled. */
  contentPositionOf: (element: HTMLElement) => { x: number; y: number };
  /** The view as it stands. */
  view: () => View;
  /** Glides to a view. */
  goTo: (view: View) => void;
};

/**
 * Drag to pan, wheel or pinch to zoom, for a content layer inside a clipped
 * viewport. The content is moved with a transform from its top-left corner;
 * the transform lives in motion values, so panning re-renders nothing.
 *
 * A drag that starts on a person still pans, and the click that ends it is
 * swallowed, so the person is not selected.
 */
export function usePanZoom({
  viewportRef,
  contentRef,
}: {
  viewportRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
}): PanZoom {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const reduceMotion = useReducedMotion();
  const animations = useRef<AnimationPlaybackControls[]>([]);
  const dragged = useRef(false);

  const stopAnimating = useCallback(() => {
    for (const animation of animations.current) animation.stop();
    animations.current = [];
  }, []);

  // Keeps some of the family on screen, so it cannot be lost off an edge.
  const clampPan = useCallback(
    (nextX: number, nextY: number, nextScale: number) => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content) return { x: nextX, y: nextY };
      const width = content.offsetWidth * nextScale;
      const height = content.offsetHeight * nextScale;
      const keepX = Math.min(KEEP_VISIBLE, width);
      const keepY = Math.min(KEEP_VISIBLE, height);
      return {
        x: clamp(nextX, keepX - width, viewport.clientWidth - keepX),
        y: clamp(nextY, keepY - height, viewport.clientHeight - keepY),
      };
    },
    [viewportRef, contentRef],
  );

  const moveTo = useCallback(
    (nextX: number, nextY: number, nextScale: number, animated: boolean) => {
      stopAnimating();
      const target = clampPan(nextX, nextY, nextScale);
      if (!animated || reduceMotion) {
        x.set(target.x);
        y.set(target.y);
        scale.set(nextScale);
        return;
      }
      animations.current = [
        animate(x, target.x, SPRING),
        animate(y, target.y, SPRING),
        animate(scale, nextScale, SPRING),
      ];
    },
    [stopAnimating, clampPan, reduceMotion, x, y, scale],
  );

  // Zooms so the content point under (clientX, clientY) stays under it.
  const zoomAt = useCallback(
    (nextScale: number, clientX: number, clientY: number, animated = false) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const bounded = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const box = viewport.getBoundingClientRect();
      const pointX = clientX - box.left;
      const pointY = clientY - box.top;
      const ratio = bounded / scale.get();
      moveTo(
        pointX - (pointX - x.get()) * ratio,
        pointY - (pointY - y.get()) * ratio,
        bounded,
        animated,
      );
    },
    [viewportRef, moveTo, x, y, scale],
  );

  useGesture(
    {
      onDragStart: () => stopAnimating(),
      onDrag: ({ delta: [dx, dy], pinching, tap, last }) => {
        if (pinching || tap) return;
        dragged.current = true;
        const viewport = viewportRef.current;
        if (viewport) viewport.style.cursor = last ? '' : 'grabbing';
        const target = clampPan(x.get() + dx, y.get() + dy, scale.get());
        x.set(target.x);
        y.set(target.y);
      },
      onPinchStart: () => stopAnimating(),
      onPinch: ({ offset: [nextScale], origin: [originX, originY], event }) => {
        event.preventDefault();
        zoomAt(nextScale, originX, originY);
      },
      // The gesture's closing call, a moment after the wheel stops, repeats
      // its last event; it is not more wheel.
      onWheel: ({ event, last }) => {
        if (last) return;
        event.preventDefault();
        stopAnimating();
        zoomAt(
          scale.get() * 2 ** wheelZoom(event),
          event.clientX,
          event.clientY,
        );
      },
      // A new press forgets the last drag. Capture runs before any person's
      // own handler sees the press.
      onPointerDownCapture: () => {
        dragged.current = false;
      },
      onClickCapture: ({ event }) => {
        if (!dragged.current) return;
        dragged.current = false;
        event.stopPropagation();
        event.preventDefault();
      },
    },
    {
      target: viewportRef,
      eventOptions: { passive: false },
      drag: {
        filterTaps: true,
        threshold: DRAG_THRESHOLD,
        // Only the primary button pans; touch and pen always count.
        pointer: { buttons: 1 },
      },
      pinch: {
        // Wheel pinches are handled with the wheel, so trackpads and mice
        // share one sensitivity.
        pinchOnWheel: false,
        scaleBounds: { min: MIN_SCALE, max: MAX_SCALE },
        from: () => [scale.get(), 0],
      },
    },
  );

  // From layout offsets, which a transform part-way through an animation
  // does not affect.
  const contentPositionOf = useCallback(
    (element: HTMLElement) => {
      const content = contentRef.current;
      let left = element.offsetWidth / 2;
      let top = element.offsetHeight / 2;
      let current: Element | null = element;
      while (current instanceof HTMLElement && current !== content) {
        left += current.offsetLeft;
        top += current.offsetTop;
        current = current.offsetParent;
      }
      return { x: left, y: top };
    },
    [contentRef],
  );

  const centreOn = useCallback<PanZoom['centreOn']>(
    (element, { visibleRight, animated = true } = {}) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const box = viewport.getBoundingClientRect();
      const right =
        visibleRight === undefined
          ? box.right
          : clamp(visibleRight, box.left, box.right);
      const centre = contentPositionOf(element);
      const current = scale.get();
      moveTo(
        (right - box.left) / 2 - centre.x * current,
        box.height / 2 - centre.y * current,
        current,
        animated,
      );
    },
    [viewportRef, contentPositionOf, moveTo, scale],
  );

  const bringIntoView = useCallback(
    (element: HTMLElement) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const box = viewport.getBoundingClientRect();
      const target = element.getBoundingClientRect();
      const margin = 24;
      const shiftX =
        target.left < box.left + margin
          ? box.left + margin - target.left
          : target.right > box.right - margin
            ? box.right - margin - target.right
            : 0;
      const shiftY =
        target.top < box.top + margin
          ? box.top + margin - target.top
          : target.bottom > box.bottom - margin
            ? box.bottom - margin - target.bottom
            : 0;
      if (shiftX === 0 && shiftY === 0) return;
      moveTo(x.get() + shiftX, y.get() + shiftY, scale.get(), true);
    },
    [viewportRef, moveTo, x, y, scale],
  );

  const zoomBy = useCallback(
    (exponent: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const box = viewport.getBoundingClientRect();
      zoomAt(
        scale.get() * 2 ** exponent,
        box.left + box.width / 2,
        box.top + box.height / 2,
        true,
      );
    },
    [viewportRef, zoomAt, scale],
  );

  const fitToView = useCallback<PanZoom['fitToView']>(
    (element, insets, { animated = true } = {}) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (width === 0 || height === 0) return;
      const centre = contentPositionOf(element);
      const availableWidth = viewport.clientWidth - insets.left - insets.right;
      const availableHeight =
        viewport.clientHeight - insets.top - insets.bottom;
      const nextScale = clamp(
        Math.min(availableWidth / width, availableHeight / height),
        MIN_SCALE,
        1,
      );
      moveTo(
        insets.left + availableWidth / 2 - centre.x * nextScale,
        insets.top + availableHeight / 2 - centre.y * nextScale,
        nextScale,
        animated,
      );
    },
    [viewportRef, contentPositionOf, moveTo],
  );

  const holdInPlace = useCallback<PanZoom['holdInPlace']>(
    (element, previous) => {
      const now = contentPositionOf(element);
      const current = scale.get();
      const shiftX = (previous.x - now.x) * current;
      const shiftY = (previous.y - now.y) * current;
      if (Math.abs(shiftX) < 0.5 && Math.abs(shiftY) < 0.5) return;
      stopAnimating();
      x.set(x.get() + shiftX);
      y.set(y.get() + shiftY);
    },
    [contentPositionOf, stopAnimating, x, y, scale],
  );

  const view = useCallback(
    () => ({ x: x.get(), y: y.get(), scale: scale.get() }),
    [x, y, scale],
  );
  const goTo = useCallback(
    (target: View) => moveTo(target.x, target.y, target.scale, true),
    [moveTo],
  );

  // Stable, so effects that use it run for their own reasons only.
  return useMemo(
    () => ({
      x,
      y,
      scale,
      centreOn,
      bringIntoView,
      zoomBy,
      fitToView,
      holdInPlace,
      contentPositionOf,
      view,
      goTo,
    }),
    [
      view,
      goTo,
      fitToView,
      x,
      y,
      scale,
      centreOn,
      bringIntoView,
      zoomBy,
      holdInPlace,
      contentPositionOf,
    ],
  );
}

/** Whether the zoom is at either end of its range, for the zoom buttons. */
export function useZoomLimits(scale: MotionValue<number>) {
  const limitOf = (value: number) =>
    value <= MIN_SCALE + 0.001
      ? 'min'
      : value >= MAX_SCALE - 0.001
        ? 'max'
        : null;
  const [limit, setLimit] = useState(() => limitOf(scale.get()));
  useMotionValueEvent(scale, 'change', (value) => setLimit(limitOf(value)));
  return { atMin: limit === 'min', atMax: limit === 'max' };
}
